"""
SCIIP - Transaction State Engine
Reconstructs original demand lines from the flattened Sales Register by
replaying rows chronologically per (SO No. + Part Code + SO Qty) and
allocating DO events to open quantity buckets, oldest-open-line-first (FIFO).

Key rule: a DO Qty continues the OLDEST open bucket whenever it fits
(do_qty <= remaining). It only starts a NEW bucket when it does NOT fit
the oldest open bucket (over-ship impossible). Buckets are partitioned by
SO Qty so shipments for differently-sized original lines can never
cross-contaminate each other - this makes reconstruction independent of
row order in the source file (verified via randomized-order trials).

Over-shipment (consignment credit-note adjustments etc.) is handled by
treating any bucket where shipped >= original as CLOSED, with the excess
reported separately (never a confusing negative open_qty).

Consignment orders (Buy. Ord. Ref. starting "Skyline Consignment") use a
SEPARATE, simpler path (reconstruct_consignment_lines) based directly on
SO Qty vs cumulative de-duplicated Invoice Qty, since DO-matching adds
nothing but risk for orders that always ship in full immediately.
"""
import pandas as pd
from dataclasses import dataclass, field


@dataclass
class Bucket:
    line_id: str
    so_no: str
    part_code: str
    customer: str
    original_qty: float
    remaining_qty: float
    opened_at_row: int
    # Descriptive context, constant per original line - captured from the
    # first row this bucket was created from
    so_date: object = None
    project: str = None
    part_desc: str = None
    buy_ord_ref: str = None
    unit_price: float = None
    lead_time: float = None
    del_date: object = None
    cus_req_de_date: object = None
    closed_at_row: int = None
    fulfillment_rows: list = field(default_factory=list)  # (row_idx, do_no, do_date, do_qty, inv_no, inv_qty, inv_amount)

    @property
    def is_open(self):
        return self.closed_at_row is None


def _new_bucket(line_id, so_no, part_code, customer, so_qty, opened_at_row, row):
    return Bucket(
        line_id=line_id, so_no=so_no, part_code=part_code, customer=customer,
        original_qty=so_qty, remaining_qty=so_qty, opened_at_row=opened_at_row,
        so_date=row.get("so_date"), project=row.get("project"),
        part_desc=row.get("part_desc"), buy_ord_ref=row.get("buy_ord_ref"),
        unit_price=row.get("unit_price"), lead_time=row.get("lead_time"),
        del_date=row.get("del_date"), cus_req_de_date=row.get("cus_req_de_date"),
    )


def _reconstruct_group(group: pd.DataFrame, so_no, part_code, so_qty, customer) -> list:
    buckets = []
    next_line_num = 1

    blank_rows = group[group["do_no"].isna()].sort_index()
    do_rows = group[group["do_no"].notna()].sort_values("do_date", kind="stable")

    for row_idx, row in blank_rows.iterrows():
        line_id = f"{so_no}-{part_code}-{so_qty}-L{next_line_num}"
        b = _new_bucket(line_id, so_no, part_code, customer, so_qty, row_idx, row)
        next_line_num += 1
        buckets.append(b)

    for row_idx, row in do_rows.iterrows():
        do_qty, do_no, do_date = row["do_qty"], row["do_no"], row["do_date"]
        inv_no = row.get("inv_no")
        inv_qty = row.get("inv_qty")
        inv_amount = row.get("inv_amount")

        open_buckets = sorted([b for b in buckets if b.is_open], key=lambda b: b.opened_at_row)
        oldest_open = open_buckets[0] if open_buckets else None

        if oldest_open is not None and do_qty <= oldest_open.remaining_qty:
            bucket = oldest_open
        else:
            line_id = f"{so_no}-{part_code}-{so_qty}-L{next_line_num}"
            bucket = _new_bucket(line_id, so_no, part_code, customer, so_qty, row_idx, row)
            next_line_num += 1
            buckets.append(bucket)

        bucket.remaining_qty -= do_qty
        bucket.fulfillment_rows.append((row_idx, do_no, do_date, do_qty, inv_no, inv_qty, inv_amount))
        if bucket.remaining_qty <= 0:
            bucket.closed_at_row = row_idx

    return buckets


def reconstruct_full_register(df: pd.DataFrame) -> pd.DataFrame:
    all_buckets = []
    for (so_no, part_code, so_qty), group in df.groupby(["so_no", "part_code", "so_qty"], sort=False):
        customer = group["cust_name"].iloc[0]
        all_buckets.extend(_reconstruct_group(group, so_no, part_code, so_qty, customer))

    records = []
    for b in all_buckets:
        do_dates = [d for _, _, d, _, _, _, _ in b.fulfillment_rows if pd.notna(d)]
        first_ship = min(do_dates) if do_dates else None
        last_ship = max(do_dates) if do_dates else None
        days_to_first_ship = (first_ship - b.so_date).days if (first_ship is not None and pd.notna(b.so_date)) else None
        days_to_close = (last_ship - b.so_date).days if (b.closed_at_row is not None and last_ship is not None and pd.notna(b.so_date)) else None
        total_invoiced_amt = sum(a for *_, a in b.fulfillment_rows if pd.notna(a))
        total_invoiced_qty = sum(iq for *_, iq, _ in b.fulfillment_rows if pd.notna(iq))
        shipped_qty = b.original_qty - b.remaining_qty
        over_shipped_qty = max(0.0, -b.remaining_qty)  # only > 0 when DO Qty exceeded original SO Qty

        records.append({
            "line_id": b.line_id,
            "so_no": b.so_no,
            "so_date": b.so_date,
            "cust_name": b.customer,
            "part_code": b.part_code,
            "part_desc": b.part_desc,
            "project": b.project,
            "buy_ord_ref": b.buy_ord_ref,
            "unit_price": b.unit_price,
            "original_qty": b.original_qty,
            "order_amt": (b.unit_price or 0) * b.original_qty,
            "shipped_qty": shipped_qty,
            "open_qty": max(0.0, b.remaining_qty),
            "over_shipped_qty": over_shipped_qty,
            "status": "CLOSED" if not b.is_open else "OPEN",
            "needs_review": over_shipped_qty > 0,  # flag consignment/credit-note style adjustments for a human look
            "num_shipments": len(b.fulfillment_rows),
            "fulfilling_dos": ", ".join(str(do) for _, do, _, _, _, _, _ in b.fulfillment_rows) or "(none yet)",
            "quoted_lead_time_days": b.lead_time,
            "committed_del_date": b.del_date,
            "cus_requested_date": b.cus_req_de_date,
            "first_ship_date": first_ship,
            "last_ship_date": last_ship,
            "actual_days_to_first_ship": days_to_first_ship,
            "actual_days_to_close": days_to_close,
            "total_invoiced_qty": total_invoiced_qty,
            "total_invoiced_amt": total_invoiced_amt,
            "is_consignment": False,
            "consigned_unbilled_qty": None,
            "consignment_fully_billed": None,
        })
    return pd.DataFrame(records)


def reconstruct_consignment_lines(df: pd.DataFrame) -> pd.DataFrame:
    """
    Consignment orders: the full SO Qty physically ships in one go, so DO-based
    bucket matching adds nothing but risk (fragile matching on DO No./Date that
    may not line up cleanly across duplicate invoice-draw rows). What actually
    matters for consignment is simpler and more direct: SO Qty (what was
    consigned) vs cumulative Invoice Qty (what's actually been used/billed
    so far). This groups directly on that, with no DO matching at all.
    """
    records = []
    group_keys = ["so_no", "part_code", "so_qty"]
    for (so_no, part_code, so_qty), group in df.groupby(group_keys, sort=False):
        first = group.iloc[0]
        # De-dupe on Inv No. so the same invoice is never double-counted,
        # even if it shows up on more than one raw row
        invoiced = group.drop_duplicates(subset=["inv_no"])
        total_invoiced_qty = invoiced["inv_qty"].sum(min_count=1) or 0.0
        total_invoiced_amt = invoiced["inv_amount"].sum(min_count=1) or 0.0
        shipped_qty = group["do_qty"].max()  # consignment ships the full qty in one go
        unbilled_qty = max(0.0, so_qty - total_invoiced_qty)

        records.append({
            "line_id": f"{so_no}-{part_code}-{so_qty}-CONSIGN",
            "so_no": so_no,
            "so_date": first.get("so_date"),
            "cust_name": first.get("cust_name"),
            "part_code": part_code,
            "part_desc": first.get("part_desc"),
            "project": first.get("project"),
            "buy_ord_ref": first.get("buy_ord_ref"),
            "unit_price": first.get("unit_price"),
            "original_qty": so_qty,
            "order_amt": (first.get("unit_price") or 0) * so_qty,
            "shipped_qty": shipped_qty,
            "open_qty": 0.0,  # physically fulfilled - see consigned_unbilled_qty for the real state
            "over_shipped_qty": 0.0,
            "status": "CLOSED",  # physically shipped in full; billing status tracked separately below
            "needs_review": False,
            "num_shipments": 1,
            "fulfilling_dos": str(first.get("do_no")),
            "quoted_lead_time_days": first.get("lead_time"),
            "committed_del_date": first.get("del_date"),
            "cus_requested_date": first.get("cus_req_de_date"),
            "first_ship_date": first.get("do_date"),
            "last_ship_date": first.get("do_date"),
            "actual_days_to_first_ship": None,
            "actual_days_to_close": None,
            "total_invoiced_qty": total_invoiced_qty,
            "total_invoiced_amt": total_invoiced_amt,
            "is_consignment": True,
            "consigned_unbilled_qty": unbilled_qty,       # sitting at customer site, shipped but not yet used/billed
            "consignment_fully_billed": unbilled_qty == 0,
        })
    return pd.DataFrame(records)
