"""
SCIIP - Demand Intelligence & Customer Intelligence
Built on top of the Transaction State Engine's demand_lines output.

Demand pattern classification uses the Syntetos-Boylan method, the standard
approach for spare-parts/intermittent demand:
    ADI (Average Demand Interval) = how many periods, on average, between
        periods that actually had demand.
    CV^2 (squared coefficient of variation) = how much the ORDER QUANTITY
        varies, in periods that did have demand.

    ADI < 1.32  & CV^2 < 0.49  -> SMOOTH       (regular timing, regular qty)
    ADI >= 1.32 & CV^2 < 0.49  -> INTERMITTENT (irregular timing, regular qty)
    ADI < 1.32  & CV^2 >= 0.49 -> ERRATIC      (regular timing, irregular qty)
    ADI >= 1.32 & CV^2 >= 0.49 -> LUMPY        (irregular timing AND qty)
"""
import pandas as pd
import numpy as np


def build_part_monthly_demand(demand_lines: pd.DataFrame, as_of_month: pd.Period = None) -> pd.DataFrame:
    """
    One row per (project, part_code, month) with total original_qty ordered
    and number of distinct demand lines in that month. Includes zero-demand
    months for every project+part group.

    IMPORTANT: every part's series extends from its own FIRST order through
    a shared `as_of_month` (default: the latest month present anywhere in
    the register) - NOT just to that part's own last order. A part that has
    genuinely gone quiet needs to show trailing zero-demand months, or
    nothing downstream (ADI, TSB occurrence probability) can ever detect
    that it went quiet.

    Grouped by project as well as part - the same part code can behave very
    differently depending on which program/project it's tied to.
    """
    df = demand_lines.dropna(subset=["so_date", "part_code", "project"]).copy()
    df["month"] = df["so_date"].dt.to_period("M")

    if as_of_month is None:
        as_of_month = df["month"].max()

    monthly = (
        df.groupby(["project", "part_code", "month"])
        .agg(qty=("original_qty", "sum"), order_lines=("line_id", "count"))
        .reset_index()
    )

    filled = []
    for (project, part_code), g in monthly.groupby(["project", "part_code"]):
        full_range = pd.period_range(g["month"].min(), as_of_month, freq="M")
        g2 = g.set_index("month")[["qty", "order_lines"]].reindex(full_range, fill_value=0)
        g2["project"] = project
        g2["part_code"] = part_code
        g2.index.name = "month"
        filled.append(g2.reset_index())

    return pd.concat(filled, ignore_index=True) if filled else pd.DataFrame()


def classify_demand_patterns(monthly_demand: pd.DataFrame) -> pd.DataFrame:
    """
    One row per (project, part_code): ADI, CV^2, classification, stats.
    """
    records = []
    for (project, part_code), g in monthly_demand.groupby(["project", "part_code"]):
        total_periods = len(g)
        nonzero = g[g["qty"] > 0]
        n_nonzero = len(nonzero)

        if n_nonzero == 0:
            continue

        adi = total_periods / n_nonzero
        mean_qty = nonzero["qty"].mean()
        std_qty = nonzero["qty"].std(ddof=0) if n_nonzero > 1 else 0.0
        cv2 = (std_qty / mean_qty) ** 2 if mean_qty > 0 else 0.0

        if adi < 1.32 and cv2 < 0.49:
            pattern = "Smooth"
        elif adi >= 1.32 and cv2 < 0.49:
            pattern = "Intermittent"
        elif adi < 1.32 and cv2 >= 0.49:
            pattern = "Erratic"
        else:
            pattern = "Lumpy"

        records.append({
            "project": project,
            "part_code": part_code,
            "active_months": total_periods,
            "months_with_demand": n_nonzero,
            "adi": round(adi, 2),
            "cv2": round(cv2, 2),
            "avg_monthly_qty_when_ordered": round(mean_qty, 2),
            "total_qty": g["qty"].sum(),
            "demand_pattern": pattern,
        })

    return pd.DataFrame(records).sort_values(["project", "total_qty"], ascending=[True, False])


def build_part_yearly_trend(demand_lines: pd.DataFrame) -> pd.DataFrame:
    """
    Pivot table: one row per (project, part_code), one column per calendar
    year, values = total quantity ordered that year.
    """
    df = demand_lines.dropna(subset=["so_date", "part_code", "project"]).copy()
    df["year"] = df["so_date"].dt.year
    pivot = df.pivot_table(
        index=["project", "part_code"], columns="year", values="original_qty",
        aggfunc="sum", fill_value=0,
    )
    pivot.columns = [str(c) for c in pivot.columns]
    pivot = pivot.reset_index()
    pivot["total_all_years"] = pivot.drop(columns=["project", "part_code"]).sum(axis=1)
    return pivot.sort_values("total_all_years", ascending=False)


def build_customer_profile(demand_lines: pd.DataFrame, as_of_date: pd.Timestamp = None) -> pd.DataFrame:
    """
    One row per customer: order behavior, revenue, recency, breadth.
    """
    if as_of_date is None:
        as_of_date = demand_lines["so_date"].max()

    df = demand_lines.dropna(subset=["cust_name", "so_date"]).copy()
    records = []
    for cust, g in df.groupby("cust_name"):
        order_dates = g["so_date"].sort_values().unique()
        n_orders = len(g)
        distinct_parts = g["part_code"].nunique()
        distinct_projects = g["project"].nunique()
        total_qty = g["original_qty"].sum()
        total_revenue = g["order_amt"].sum()
        first_order = g["so_date"].min()
        last_order = g["so_date"].max()
        recency_days = (as_of_date - last_order).days
        tenure_days = (last_order - first_order).days

        if len(order_dates) > 1:
            intervals = np.diff(order_dates).astype("timedelta64[D]").astype(int)
            avg_order_interval_days = float(np.mean(intervals))
        else:
            avg_order_interval_days = None

        open_lines = g[g["status"] == "OPEN"]

        records.append({
            "cust_name": cust,
            "total_demand_lines": n_orders,
            "distinct_parts": distinct_parts,
            "distinct_projects": distinct_projects,
            "total_qty_ordered": total_qty,
            "total_revenue": round(total_revenue, 2),
            "avg_order_value": round(total_revenue / n_orders, 2) if n_orders else 0,
            "first_order_date": first_order,
            "last_order_date": last_order,
            "recency_days": recency_days,
            "tenure_days": tenure_days,
            "avg_order_interval_days": round(avg_order_interval_days, 1) if avg_order_interval_days else None,
            "currently_open_lines": len(open_lines),
            "currently_open_qty": open_lines["open_qty"].sum(),
        })

    return pd.DataFrame(records).sort_values("total_revenue", ascending=False)


def build_customer_yearly_trend(demand_lines: pd.DataFrame) -> pd.DataFrame:
    """
    Pivot table: one row per (customer, project), one column per calendar
    year, values = total revenue that year.
    """
    df = demand_lines.dropna(subset=["so_date", "cust_name", "project"]).copy()
    df["year"] = df["so_date"].dt.year
    pivot = df.pivot_table(
        index=["cust_name", "project"], columns="year", values="order_amt",
        aggfunc="sum", fill_value=0,
    )
    pivot.columns = [str(c) for c in pivot.columns]
    pivot = pivot.reset_index()
    pivot["total_all_years"] = pivot.drop(columns=["cust_name", "project"]).sum(axis=1)
    return pivot.sort_values("total_all_years", ascending=False)


def build_part_customer_breakdown(demand_lines: pd.DataFrame) -> pd.DataFrame:
    """
    One row per (project, part_code, cust_name): that customer's contribution
    to this part's demand - qty, share of total, order count, their own
    ordering cadence for this specific part.
    """
    df = demand_lines.dropna(subset=["so_date", "part_code", "project", "cust_name"]).copy()
    records = []
    for (project, part_code), part_group in df.groupby(["project", "part_code"]):
        part_total_qty = part_group["original_qty"].sum()
        for cust_name, g in part_group.groupby("cust_name"):
            order_dates = g["so_date"].sort_values().unique()
            if len(order_dates) > 1:
                intervals = pd.Series(order_dates).diff().dt.days.dropna()
                avg_interval = round(intervals.mean(), 1)
            else:
                avg_interval = None
            records.append({
                "project": project,
                "part_code": part_code,
                "cust_name": cust_name,
                "cust_qty": g["original_qty"].sum(),
                "pct_of_part_demand": round(100 * g["original_qty"].sum() / part_total_qty, 1) if part_total_qty else 0,
                "order_count": len(g),
                "first_order_date": g["so_date"].min(),
                "last_order_date": g["so_date"].max(),
                "avg_order_interval_days": avg_interval,
            })
    return pd.DataFrame(records)


def build_part_customer_concentration(customer_breakdown: pd.DataFrame) -> pd.DataFrame:
    """
    One row per (project, part_code): who the top customer is and how
    concentrated demand is on them.
    """
    records = []
    for (project, part_code), g in customer_breakdown.groupby(["project", "part_code"]):
        g_sorted = g.sort_values("cust_qty", ascending=False)
        top = g_sorted.iloc[0]
        records.append({
            "project": project,
            "part_code": part_code,
            "num_customers": len(g),
            "top_customer": top["cust_name"],
            "top_customer_pct_of_demand": top["pct_of_part_demand"],
            "top_customer_avg_order_interval_days": top["avg_order_interval_days"],
            "top_customer_last_order_date": top["last_order_date"],
        })
    return pd.DataFrame(records)


def build_part_intelligence_summary(pattern_classification: pd.DataFrame, forecasts: pd.DataFrame,
                                      concentration: pd.DataFrame) -> pd.DataFrame:
    """
    ONE consolidated, dashboard-ready table: every part's classification,
    forecast, and customer-concentration context in a single row.
    """
    merged = pattern_classification.merge(forecasts, on=["project", "part_code"], suffixes=("", "_fc"))
    merged = merged.merge(concentration, on=["project", "part_code"], how="left")
    forecast_horizon_col = [c for c in merged.columns if c.startswith("forecast_next_")][0]
    keep_cols = [
        "project", "part_code", "demand_pattern", "adi", "cv2",
        "total_qty", "months_with_demand", "active_months",
        "forecast_method", "occurrence_probability_this_month", "expected_qty_if_it_occurs",
        "predicted_to_occur_this_month",
        "forecast_monthly_qty", forecast_horizon_col,
        "num_customers", "top_customer", "top_customer_pct_of_demand",
        "top_customer_avg_order_interval_days", "top_customer_last_order_date",
    ]
    keep_cols = [c for c in keep_cols if c in merged.columns]
    return merged[keep_cols].sort_values("total_qty", ascending=False)


def add_relationship_health(customer_breakdown: pd.DataFrame, as_of_date: pd.Timestamp = None) -> pd.DataFrame:
    """
    Adds a status per (project, part_code, cust_name) row: is this specific
    customer's ordering of this specific part on track, or has it gone
    quiet relative to THEIR OWN historical cadence for that part? A customer
    who usually orders a part every ~60 days and hasn't in 200 days is a
    real, explainable signal - not the same thing as the part's overall
    demand pattern, which blends every customer together.
    """
    df = customer_breakdown.copy()
    if as_of_date is None:
        as_of_date = df["last_order_date"].max()

    df["days_since_last_order"] = (as_of_date - df["last_order_date"]).dt.days

    def status(row):
        if row["order_count"] < 2 or pd.isna(row["avg_order_interval_days"]):
            return "New / not enough history"
        ratio = row["days_since_last_order"] / row["avg_order_interval_days"]
        if ratio <= 1.25:
            return "Active"
        elif ratio <= 2.0:
            return "Due soon"
        else:
            return "Overdue / went quiet"

    df["relationship_status"] = df.apply(status, axis=1)
    return df
