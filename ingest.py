"""
SCIIP - Ingestion Layer
Reads a raw SAP Sales Register export (Excel or CSV) and standardizes it
into a clean DataFrame ready for the Transaction State Engine.

Design principle: this layer NEVER changes business values (SAP is source
of truth) - it only standardizes types/formats and flags structural issues
for review. It does not silently "fix" or drop suspicious rows.
"""
import pandas as pd
from pathlib import Path

# Canonical column names we expect from the Sales Register export.
# Keys = exact SAP export header, Values = internal standardized name.
COLUMN_MAP = {
    "SO No.": "so_no",
    "SO Date": "so_date",
    "Cust. Name": "cust_name",
    "Buy. Ord. Ref.": "buy_ord_ref",
    "Part Code": "part_code",
    "Project": "project",
    "Part Desc": "part_desc",
    "SO Qty": "so_qty",
    "Unit Price": "unit_price",
    "Order Amt.": "order_amt",
    "Lead Time": "lead_time",
    "Del Date": "del_date",
    "DO No.": "do_no",
    "DO Date": "do_date",
    "DO Qty": "do_qty",
    "Inv No.": "inv_no",
    "Inv Date": "inv_date",
    "Inv Qty": "inv_qty",
    "Inv Amount": "inv_amount",
    "Freight": "freight",
    "Fr. Amt": "fr_amt",
    "Pay. Terms": "pay_terms",
    "Cus. Req. De. Date": "cus_req_de_date",
    "Cus,Req DeDate.": "cus_req_de_date",
    "Pay. St.": "pay_status",
    "Roy. Char.": "roy_char",
    "Pay. Date": "pay_date",
}

DATE_COLS = ["so_date", "del_date", "do_date", "inv_date", "cus_req_de_date", "pay_date"]
NUMERIC_COLS = ["so_qty", "unit_price", "order_amt", "lead_time", "do_qty",
                 "inv_qty", "inv_amount", "freight", "fr_amt", "roy_char"]
REQUIRED_COLS = ["so_no", "so_date", "cust_name", "part_code", "so_qty"]


class IngestionReport:
    """Collects data-quality findings during ingestion, for review - not silent."""
    def __init__(self):
        self.issues: list[str] = []
        self.row_count_raw = 0
        self.row_count_clean = 0

    def add(self, msg: str):
        self.issues.append(msg)

    def summary(self) -> str:
        lines = [
            f"Rows read: {self.row_count_raw}",
            f"Rows retained: {self.row_count_clean}",
            f"Issues found: {len(self.issues)}",
        ]
        lines += [f"  - {i}" for i in self.issues]
        return "\n".join(lines)


def load_sales_register(filepath: str) -> tuple[pd.DataFrame, IngestionReport]:
    report = IngestionReport()
    path = Path(filepath)

    if path.suffix.lower() in (".xlsx", ".xls"):
        df = pd.read_excel(path, dtype=str)
    elif path.suffix.lower() == ".csv":
        df = pd.read_csv(path, dtype=str)
    else:
        raise ValueError(f"Unsupported file type: {path.suffix}")

    report.row_count_raw = len(df)

    # Strip whitespace from headers, map to internal names
    df.columns = [c.strip() for c in df.columns]
    unmapped = [c for c in df.columns if c not in COLUMN_MAP]
    if unmapped:
        report.add(f"Unmapped columns found (kept as-is, not used by engine): {unmapped}")

    df = df.rename(columns=COLUMN_MAP)

    missing_required = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing_required:
        raise ValueError(f"Missing required columns after mapping: {missing_required}")

    # Standardize types
    for col in df.columns:
        if col in df and df[col].dtype == object:
            df[col] = df[col].str.strip()
            df[col] = df[col].replace({"": None, "nan": None, "NaN": None})

    for col in DATE_COLS:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")

    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Structural checks (report, don't silently drop)
    null_key_rows = df[df["so_no"].isna() | df["part_code"].isna()]
    if len(null_key_rows) > 0:
        report.add(f"{len(null_key_rows)} rows have blank SO No. or Part Code - excluded from engine input")
        df = df[~(df["so_no"].isna() | df["part_code"].isna())]

    bad_qty_rows = df[df["so_qty"].isna() | (df["so_qty"] <= 0)]
    if len(bad_qty_rows) > 0:
        report.add(f"{len(bad_qty_rows)} rows have missing/zero/negative SO Qty - excluded from engine input")
        df = df[~(df["so_qty"].isna() | (df["so_qty"] <= 0))]

    # DO Qty should be null (untouched line) or a positive number - flag anything else
    bad_do_qty = df[df["do_no"].notna() & (df["do_qty"].isna() | (df["do_qty"] <= 0))]
    if len(bad_do_qty) > 0:
        report.add(f"{len(bad_do_qty)} rows have a DO No. but missing/zero/negative DO Qty - FLAGGED, kept for manual review, excluded from engine input")
        df = df[~(df["do_no"].notna() & (df["do_qty"].isna() | (df["do_qty"] <= 0)))]

    dupe_mask = df.duplicated(subset=["so_no", "part_code", "do_no", "do_qty"], keep=False) & df["do_no"].notna()
    if dupe_mask.sum() > 0:
        report.add(f"{dupe_mask.sum()} rows are exact duplicates on (SO No., Part Code, DO No., DO Qty) - kept, but flag for manual check (could be legitimate repeated same-qty shipments, or a duplicate export row)")

    report.row_count_clean = len(df)
    df = df.reset_index(drop=True)
    return df, report


def consolidate_consignment_orders(df: pd.DataFrame, po_prefix: str = "Skyline Consignment") -> tuple[pd.DataFrame, int]:
    """
    NOTE: superseded by transaction_engine.reconstruct_consignment_lines(),
    which uses a direct SO-vs-Invoice approach instead. Kept here in case
    it's useful later, but not called by the pipeline.
    """
    is_consignment = df["buy_ord_ref"].fillna("").str.strip().str.lower().str.startswith(po_prefix.lower())
    consignment_df = df[is_consignment].copy()
    normal_df = df[~is_consignment].copy()

    if len(consignment_df) == 0:
        return df, 0

    group_keys = ["so_no", "part_code", "so_qty", "do_no", "do_date", "do_qty"]
    before = len(consignment_df)

    agg_dict = {col: "first" for col in consignment_df.columns if col not in group_keys}
    agg_dict["inv_no"] = lambda s: ", ".join(str(x) for x in s.dropna().unique())
    agg_dict["inv_qty"] = lambda s: s.sum(min_count=1)
    agg_dict["inv_amount"] = lambda s: s.sum(min_count=1)
    agg_dict["inv_date"] = "max"

    consolidated = consignment_df.groupby(group_keys, as_index=False, dropna=False, sort=False).agg(agg_dict)
    after = len(consolidated)
    rows_collapsed = before - after

    result = pd.concat([normal_df, consolidated], ignore_index=True)
    return result, rows_collapsed
