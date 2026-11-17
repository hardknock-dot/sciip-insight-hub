"""
SCIIP Dashboard
Run with: streamlit run dashboard.py

Reads directly from data/sciip.db - the same database pipeline.py writes to.
Requires Streamlit 1.35+ for interactive dataframe row selection
(pip install --upgrade streamlit if selection clicks don't do anything).
"""
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
import streamlit as st
import plotly.graph_objects as go

DB_PATH = Path(__file__).parent / "data" / "sciip.db"
APP_NAME = "Supply Chain Inventory Intelligence Platform"

st.set_page_config(page_title=f"SCIIP - {APP_NAME}", layout="wide",
                    initial_sidebar_state="collapsed", page_icon="◆")

PATTERN_COLOR = {"Smooth": "#34D399", "Intermittent": "#FB923C", "Erratic": "#5EEAD4", "Lumpy": "#F43F5E"}
COMPARE_COLORS = ["#5EEAD4", "#FB923C", "#34D399", "#F43F5E", "#A78BFA", "#FBBF24"]

# ---------------------------------------------------------------------------
# Design tokens + global styling
# ---------------------------------------------------------------------------
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
    --bg: #0A0E17; --panel: #121826; --panel-border: #1E293B;
    --text: #E2E8F0; --text-muted: #64748B;
    --teal: #5EEAD4; --amber: #FB923C; --rose: #F43F5E; --emerald: #34D399;
}
.stApp { background-color: var(--bg); color: var(--text); }
h1, h2, h3, .scp-title { font-family: 'Space Grotesk', sans-serif !important; letter-spacing: 0.01em; }
body, p, div, span, label { font-family: 'Inter', sans-serif; }
.scp-mono { font-family: 'IBM Plex Mono', monospace; }
.scp-desc { color: var(--text-muted); font-size: 13px; margin-top: -6px; margin-bottom: 12px; }

.scp-topbar { display: flex; justify-content: space-between; align-items: center;
    padding: 14px 4px 16px 4px; border-bottom: 1px solid var(--panel-border); margin-bottom: 14px; }
.scp-wordmark { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 22px;
    letter-spacing: 0.06em; color: var(--text); }
.scp-wordmark span { color: var(--teal); }
.scp-freshness { font-family: 'IBM Plex Mono', monospace; font-size: 12px; color: var(--text-muted);
    display: flex; align-items: center; gap: 8px; }
.scp-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--teal);
    box-shadow: 0 0 8px var(--teal); animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

.scp-kpi { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 10px;
    padding: 16px 18px; height: 100%; }
.scp-kpi-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
    color: var(--text-muted); margin-bottom: 6px; }
.scp-kpi-value { font-family: 'IBM Plex Mono', monospace; font-size: 26px; font-weight: 600; color: var(--text); }
.scp-kpi-sub { font-size: 11px; color: var(--text-muted); margin-top: 4px; }

.scp-pill { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px;
    font-weight: 600; font-family: 'IBM Plex Mono', monospace; letter-spacing: 0.02em; white-space: nowrap; }
.scp-pill-smooth, .scp-pill-active, .scp-pill-growing { background: rgba(52,211,153,0.15); color: var(--emerald); }
.scp-pill-intermittent, .scp-pill-duesoon { background: rgba(251,146,60,0.15); color: var(--amber); }
.scp-pill-erratic, .scp-pill-stable { background: rgba(94,234,212,0.15); color: var(--teal); }
.scp-pill-lumpy, .scp-pill-overdue, .scp-pill-declining { background: rgba(244,63,94,0.15); color: var(--rose); }
.scp-pill-new { background: rgba(100,116,139,0.15); color: var(--text-muted); }

.scp-panel { background: var(--panel); border: 1px solid var(--panel-border); border-radius: 12px;
    padding: 20px 22px; margin-top: 10px; }
.scp-hero { background: linear-gradient(115deg, #172B35 0%, #121826 62%); border: 1px solid #28515A;
    border-radius: 12px; padding: 24px 26px; margin: 4px 0 18px; }
.scp-hero-kicker { color: var(--teal); font-family: 'IBM Plex Mono', monospace; font-size: 11px;
    letter-spacing: .12em; text-transform: uppercase; }
.scp-hero-title { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700;
    margin: 6px 0 4px; color: #F8FAFC; }
.scp-hero-copy { color: #A8BBC1; font-size: 13px; max-width: 720px; }
.scp-alert { border-left: 3px solid var(--rose); padding: 10px 14px; background: rgba(244,63,94,.08);
    margin: 8px 0; font-size: 13px; }
.scp-alert-amber { border-left-color: var(--amber); background: rgba(251,146,60,.08); }
.scp-action-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.scp-action-table th { color: var(--text-muted); text-align: left; font-size: 10px; text-transform: uppercase;
    letter-spacing: .08em; padding: 8px 6px; border-bottom: 1px solid var(--panel-border); }
.scp-action-table td { padding: 10px 6px; border-bottom: 1px solid var(--panel-border); }
.scp-action-table .num { font-family: 'IBM Plex Mono', monospace; text-align: right; }
.scp-section-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
    color: var(--text-muted); margin-bottom: 10px; font-weight: 600; }
.scp-row-item { display: flex; justify-content: space-between; align-items: center;
    padding: 8px 0; border-bottom: 1px solid var(--panel-border); font-size: 13px; }
.scp-soon { opacity: 0.55; text-align: center; padding: 50px 20px; }
.scp-hint { color: var(--text-muted); font-size: 12px; font-style: italic; margin-bottom: 8px; }
hr { border-color: var(--panel-border) !important; }
div[data-baseweb="radio"] label { font-family: 'IBM Plex Mono', monospace !important; font-size: 12px !important; }
</style>
""", unsafe_allow_html=True)


# ---------------------------------------------------------------------------
# Data access
# ---------------------------------------------------------------------------
@st.cache_data(ttl=300)
def load_table(table_name: str) -> pd.DataFrame:
    if not DB_PATH.exists():
        return pd.DataFrame()
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql(f"SELECT * FROM {table_name}", conn)
    except Exception:
        df = pd.DataFrame()
    conn.close()
    return df


def get_freshness() -> str:
    df = load_table("demand_lines")
    if len(df) == 0 or "_computed_at" not in df.columns:
        return "no data yet"
    return df["_computed_at"].max()


def pill(label, css_class):
    return f'<span class="scp-pill scp-pill-{css_class}">{label}</span>'


def pattern_pill(pattern):
    return pill(pattern, pattern.lower())


def status_pill(status):
    key = {"Active": "active", "Due soon": "duesoon", "Overdue / went quiet": "overdue"}.get(status, "new")
    return pill(status, key)


def multi_search_mask(df, query, columns):
    """Match any comma, semicolon, or newline-separated search term."""
    terms = [term.strip() for term in query.replace(";", ",").replace("\n", ",").split(",") if term.strip()]
    if not terms:
        return pd.Series(True, index=df.index)
    return pd.concat([
        df[column].astype(str).str.contains(term, case=False, na=False, regex=False)
        for term in terms for column in columns if column in df.columns
    ], axis=1).any(axis=1)


def yearly_trend_direction(yearly_df, id_cols):
    df = yearly_df.copy()
    year_cols = sorted([c for c in df.columns if c.isdigit()])
    if len(year_cols) < 2:
        df["trend_direction"] = "New / not enough history"
        df["yoy_change_pct"] = None
        return df
    prev_col, curr_col = year_cols[-2], year_cols[-1]

    def calc(row):
        prev, curr = row[prev_col], row[curr_col]
        if prev == 0 and curr == 0:
            return "New / not enough history", None
        if prev == 0:
            return "Growing", None
        pct = round(100 * (curr - prev) / prev, 1)
        if pct > 10:
            return "Growing", pct
        elif pct < -10:
            return "Declining", pct
        return "Stable", pct

    results = df.apply(calc, axis=1)
    df["trend_direction"] = results.apply(lambda x: x[0])
    df["yoy_change_pct"] = results.apply(lambda x: x[1])
    return df


def waveform_chart(monthly_df, title=""):
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=monthly_df["month"].astype(str), y=monthly_df["qty"],
        mode="lines+markers", line=dict(color="#5EEAD4", width=2, shape="spline"),
        marker=dict(size=5, color="#5EEAD4"),
        fill="tozeroy", fillcolor="rgba(94,234,212,0.08)",
    ))
    fig.update_layout(
        title=dict(text=title, font=dict(family="IBM Plex Mono", size=12, color="#64748B")),
        plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
        font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
        xaxis=dict(gridcolor="#1E293B", showgrid=True, zeroline=False),
        yaxis=dict(gridcolor="#1E293B", showgrid=True, zeroline=False, title="Qty"),
        margin=dict(l=40, r=20, t=30, b=30), height=260, showlegend=False,
    )
    return fig


def multi_waveform_chart(series_list):
    """series_list: list of (label, monthly_df) tuples - overlays multiple parts for comparison."""
    fig = go.Figure()
    for i, (label, mdf) in enumerate(series_list):
        color = COMPARE_COLORS[i % len(COMPARE_COLORS)]
        fig.add_trace(go.Scatter(
            x=mdf["month"].astype(str), y=mdf["qty"], mode="lines+markers", name=label,
            line=dict(color=color, width=2, shape="spline"), marker=dict(size=4, color=color),
        ))
    fig.update_layout(
        plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
        font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
        xaxis=dict(gridcolor="#1E293B", showgrid=True, zeroline=False),
        yaxis=dict(gridcolor="#1E293B", showgrid=True, zeroline=False, title="Qty"),
        margin=dict(l=40, r=20, t=20, b=30), height=320,
        legend=dict(orientation="h", yanchor="bottom", y=1.02, font=dict(size=10)),
    )
    return fig


def yearly_bar_chart(row, year_cols, title=""):
    fig = go.Figure(go.Bar(x=year_cols, y=[row[y] for y in year_cols], marker=dict(color="#5EEAD4")))
    fig.update_layout(
        title=dict(text=title, font=dict(family="IBM Plex Mono", size=12, color="#64748B")),
        plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
        font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
        xaxis=dict(gridcolor="#1E293B", showgrid=False),
        yaxis=dict(gridcolor="#1E293B", showgrid=True, zeroline=False),
        margin=dict(l=40, r=20, t=30, b=30), height=200, showlegend=False,
    )
    return fig


def pattern_distribution_chart(part_intel_df):
    counts = part_intel_df["demand_pattern"].value_counts()
    patterns = ["Smooth", "Erratic", "Intermittent", "Lumpy"]
    values = [counts.get(p, 0) for p in patterns]
    colors = [PATTERN_COLOR[p] for p in patterns]
    fig = go.Figure(go.Bar(x=patterns, y=values, marker=dict(color=colors)))
    fig.update_layout(
        plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
        font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
        xaxis=dict(gridcolor="#1E293B"), yaxis=dict(gridcolor="#1E293B", title="Parts"),
        margin=dict(l=40, r=20, t=10, b=30), height=240, showlegend=False,
    )
    return fig


def project_comparison_chart(demand_lines_df):
    by_project = demand_lines_df.groupby("project")["order_amt"].sum().sort_values(ascending=False)
    fig = go.Figure(go.Bar(x=by_project.index.tolist(), y=by_project.values.tolist(), marker=dict(color="#5EEAD4")))
    fig.update_layout(
        plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
        font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
        xaxis=dict(gridcolor="#1E293B"), yaxis=dict(gridcolor="#1E293B", title="Total Order Value ($)"),
        margin=dict(l=50, r=20, t=10, b=30), height=240, showlegend=False,
    )
    return fig


@st.dialog("Part insight", width="large")
def show_part_insight(project, part_code, customer):
    part_rows = part_intel[(part_intel["project"] == project) & (part_intel["part_code"] == part_code)]
    if len(part_rows) == 0:
        st.warning("No part intelligence is available for this selection.")
        return
    part = part_rows.iloc[0]
    forecast_rows = forecasts[(forecasts["project"] == project) &
                              (forecasts["part_code"] == part_code)]
    forecast = forecast_rows.iloc[0] if len(forecast_rows) else pd.Series(dtype=object)
    forecast_monthly_qty = forecast.get("forecast_monthly_qty", part.get("forecast_monthly_qty", 0))
    forecast_three_month_qty = forecast.get("forecast_next_3mo_qty", part.get("forecast_next_3mo_qty", forecast_monthly_qty * 3))
    forecast_method = forecast.get("forecast_method", "Forecast method unavailable")
    months_of_history = forecast.get("months_of_history", "unknown")
    history = demand_lines[(demand_lines["project"] == project) &
                           (demand_lines["part_code"] == part_code) &
                           (demand_lines["cust_name"] == customer)].copy()
    history["so_date"] = pd.to_datetime(history["so_date"], errors="coerce")
    history = history.dropna(subset=["so_date"])

    st.markdown(f"### {part_code}")
    if pd.notna(part.get("part_desc")):
        st.caption(part["part_desc"])
    st.markdown(f"**{customer}** · {project} · {pattern_pill(part['demand_pattern'])}", unsafe_allow_html=True)
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Forecast / month", f"{forecast_monthly_qty:,.1f}")
    c2.metric("Forecast / 3 months", f"{forecast_three_month_qty:,.1f}")
    c3.metric("Customer qty", f"{history['original_qty'].sum():,.0f}")
    c4.metric("Customer orders", f"{history['so_no'].nunique():,.0f}")

    if len(history):
        history["month"] = history["so_date"].dt.to_period("M").astype(str)
        monthly = history.groupby("month", as_index=False).agg(
            quantity=("original_qty", "sum"), orders=("so_no", "nunique"))
        chart = go.Figure(go.Bar(x=monthly["month"], y=monthly["quantity"], marker=dict(color="#FB923C"),
                                 customdata=monthly[["orders"]],
                                 hovertemplate="%{x}<br>Qty: %{y:,.0f}<br>Orders: %{customdata[0]}<extra></extra>"))
        chart.update_layout(plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
                            font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
                            xaxis=dict(gridcolor="#1E293B", title="Order month"),
                            yaxis=dict(gridcolor="#1E293B", title="Quantity"),
                            margin=dict(l=40, r=20, t=20, b=40), height=280, showlegend=False)
        st.plotly_chart(chart, use_container_width=True, config={"displayModeBar": False})
        st.markdown('<div class="scp-section-label">Customer order detail for this part</div>', unsafe_allow_html=True)
        detail_columns = [c for c in ["so_no", "so_date", "original_qty", "shipped_qty", "open_qty", "status"] if c in history.columns]
        detail = history.sort_values("so_date", ascending=False)[detail_columns].rename(columns={
            "so_no": "SO No.", "so_date": "Order Date", "original_qty": "Ordered Qty",
            "shipped_qty": "Shipped Qty", "open_qty": "Open Qty", "status": "Status"})
        st.dataframe(detail, use_container_width=True, hide_index=True, height=230)
    else:
        st.info("No order history is available for this customer and part.")

    st.markdown('<div class="scp-section-label">How the part insight is determined</div>', unsafe_allow_html=True)
    st.caption(f"The demand pattern is {part['demand_pattern']} based on historical monthly demand. The forecast uses {forecast_method}, with {months_of_history} months of history. The customer view uses {part['top_customer']} as the largest account for this part, representing {part['top_customer_pct_of_demand']:.0f}% of total part demand.")


def planning_signals(part_df, demand_df):
    """Demand-only planning signals; true coverage needs on-hand and lead time."""
    if len(part_df) == 0:
        return pd.DataFrame()
    open_qty = (demand_df[demand_df["status"] == "OPEN"].groupby(["project", "part_code"])["open_qty"]
                .sum().rename("open_qty")) if len(demand_df) else pd.Series(dtype=float)
    signals = part_df.copy().set_index(["project", "part_code"])
    signals["open_qty"] = open_qty
    signals["open_qty"] = signals["open_qty"].fillna(0)
    horizon_col = [c for c in signals.columns if c.startswith("forecast_next_")]
    horizon_col = horizon_col[0] if horizon_col else None
    signals["planning_gap"] = (signals[horizon_col] - signals["open_qty"]).clip(lower=0) if horizon_col else 0
    signals["priority"] = np.select(
        [signals["demand_pattern"].isin(["Lumpy", "Erratic"]) & (signals["planning_gap"] > 0),
         signals["planning_gap"] > 0], ["Review", "Plan"], default="Monitor")
    return signals.reset_index().sort_values(["priority", "planning_gap"], ascending=[True, False])


# ---------------------------------------------------------------------------
# Load everything once
# ---------------------------------------------------------------------------
part_intel = load_table("part_intelligence_summary")
customer_profiles = load_table("customer_profiles")
accuracy = load_table("part_forecast_accuracy")
demand_lines = load_table("demand_lines")
breakdown = load_table("part_customer_breakdown")
cust_yearly = load_table("customer_yearly_trend")
part_yearly = load_table("part_yearly_trend")
monthly_demand = load_table("part_monthly_demand")
tuned_params = load_table("part_tuned_parameters")
forecasts = load_table("part_forecasts")

# Part descriptions aren't stored in part_intelligence_summary - pull them
# straight from demand_lines (one lookup, no pipeline changes needed)
if len(demand_lines) > 0:
    part_desc_lookup = demand_lines.drop_duplicates(["project", "part_code"])[["project", "part_code", "part_desc"]]
    part_intel = part_intel.merge(part_desc_lookup, on=["project", "part_code"], how="left")

# ---------------------------------------------------------------------------
# Top bar
# ---------------------------------------------------------------------------
freshness = get_freshness()
st.markdown(f"""
<div class="scp-topbar">
    <div><div class="scp-wordmark">SCI<span>IP</span></div><div class="scp-desc">{APP_NAME}</div></div>
    <div class="scp-freshness"><div class="scp-pulse"></div>DATA AS OF {freshness}</div>
</div>
""", unsafe_allow_html=True)

if len(part_intel) == 0:
    st.info("No data yet - run `python pipeline.py <your_export.xlsx>` first, then reload this page.")
    st.stop()

# ---------------------------------------------------------------------------
# Global project filter
# ---------------------------------------------------------------------------
all_projects = sorted(part_intel["project"].dropna().unique().tolist())
project_filter = st.radio("Project", ["All"] + all_projects, horizontal=True, label_visibility="collapsed")

def scope(df, col="project"):
    if project_filter == "All" or col not in df.columns:
        return df
    return df[df[col] == project_filter]

part_intel_f = scope(part_intel)
breakdown_f = scope(breakdown)
demand_lines_f = scope(demand_lines)
part_yearly_f = scope(part_yearly)
monthly_demand_f = scope(monthly_demand)
accuracy_f = scope(accuracy)
signals_f = planning_signals(part_intel_f, demand_lines_f)
forecasts_f = scope(forecasts)

latest_demand_month = pd.to_datetime(monthly_demand["month"], errors="coerce").max() if len(monthly_demand) else pd.Timestamp.today()
forecast_months = [latest_demand_month.to_period("M") + offset for offset in range(1, 4)]
forecast_month_labels = [period.strftime("%b %Y") for period in forecast_months]

if len(demand_lines_f):
    demand_lines_f = demand_lines_f.copy()
    demand_lines_f["line_value"] = demand_lines_f["original_qty"] * demand_lines_f["unit_price"]
    part_revenue = demand_lines_f.groupby(["project", "part_code"], as_index=False).agg(
        revenue=("line_value", "sum"), open_qty=("open_qty", "sum"), orders=("so_no", "nunique"))
else:
    part_revenue = pd.DataFrame(columns=["project", "part_code", "revenue", "open_qty", "orders"])
top_parts = part_intel_f.merge(part_revenue, on=["project", "part_code"], how="left")
top_parts[["revenue", "open_qty", "orders"]] = top_parts[["revenue", "open_qty", "orders"]].fillna(0)
top_parts = top_parts.sort_values("revenue", ascending=False)

if project_filter == "All":
    customers_in_scope = customer_profiles["cust_name"]
else:
    customers_in_scope = breakdown_f["cust_name"].unique()
customer_profiles_f = customer_profiles[customer_profiles["cust_name"].isin(customers_in_scope)]
top_customers = customer_profiles_f.sort_values("total_revenue", ascending=False).copy()

st.markdown("<br>", unsafe_allow_html=True)

if project_filter == "All":
    hero_title = "The next decision is visible."
else:
    hero_title = f"{project_filter}: turn demand into an action plan."
review_count = int((signals_f["priority"] == "Review").sum()) if len(signals_f) else 0
gap_units = signals_f["planning_gap"].sum() if len(signals_f) else 0
st.markdown(f"""
<div class="scp-hero">
    <div class="scp-hero-kicker">SCIIP / decision brief</div>
    <div class="scp-hero-title">{hero_title}</div>
    <div class="scp-hero-copy">A demand-led view of what deserves attention now: {review_count} volatile parts need review and {gap_units:,.0f} forecast units are not covered by currently open demand over the next three months.</div>
</div>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# KPI strip
# ---------------------------------------------------------------------------
k1, k2, k3, k4, k5 = st.columns(5)
with k1:
    st.markdown(f'<div class="scp-kpi"><div class="scp-kpi-label">Active Parts</div>'
                f'<div class="scp-kpi-value">{len(part_intel_f)}</div></div>', unsafe_allow_html=True)
with k2:
    st.markdown(f'<div class="scp-kpi"><div class="scp-kpi-label">Customers</div>'
                f'<div class="scp-kpi-value">{len(customer_profiles_f)}</div></div>', unsafe_allow_html=True)
with k3:
    pattern_counts = part_intel_f["demand_pattern"].value_counts().to_dict() if len(part_intel_f) else {}
    dominant = max(pattern_counts, key=pattern_counts.get) if pattern_counts else "-"
    lumpy_pct = 100 * part_intel_f["demand_pattern"].isin(["Lumpy", "Erratic"]).mean() if len(part_intel_f) else 0
    st.markdown(f'<div class="scp-kpi"><div class="scp-kpi-label">Dominant Pattern</div>'
                f'<div class="scp-kpi-value">{dominant}</div><div class="scp-kpi-sub">{lumpy_pct:.0f}% Lumpy/Erratic</div></div>', unsafe_allow_html=True)
with k4:
    if len(accuracy_f) > 0:
        avg_hit = accuracy_f["occurrence_hit_rate_pct"].mean()
        st.markdown(f'<div class="scp-kpi"><div class="scp-kpi-label">Avg Forecast Hit Rate</div>'
                    f'<div class="scp-kpi-value">{avg_hit:.0f}%</div></div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="scp-kpi"><div class="scp-kpi-label">Avg Forecast Hit Rate</div><div class="scp-kpi-value">-</div></div>', unsafe_allow_html=True)
with k5:
    if len(demand_lines_f) > 0:
        open_rows = demand_lines_f[demand_lines_f["status"] == "OPEN"]
        open_value = (open_rows["open_qty"] * open_rows["unit_price"]).sum()
        st.markdown(f'<div class="scp-kpi"><div class="scp-kpi-label">Open Order Value</div>'
                    f'<div class="scp-kpi-value">${open_value:,.0f}</div></div>', unsafe_allow_html=True)
    else:
        st.markdown('<div class="scp-kpi"><div class="scp-kpi-label">Open Order Value</div><div class="scp-kpi-value">-</div></div>', unsafe_allow_html=True)

st.markdown("<br>", unsafe_allow_html=True)

tab_overview, tab_customer, tab_part, tab_replen, tab_ai = st.tabs(
    ["◆ Overview", "◆ Customer Intelligence", "◆ Part Intelligence", "◆ Replenishment", "◆ AI Copilot"])

# ===========================================================================
# OVERVIEW
# ===========================================================================
with tab_overview:
    st.markdown('<div class="scp-section-label">Today\'s decision queue</div>', unsafe_allow_html=True)
    queue_col, meeting_col = st.columns([1.35, 1])
    with queue_col:
        queue = signals_f[signals_f["planning_gap"] > 0].head(7) if len(signals_f) else pd.DataFrame()
        if len(queue):
            queue_view = queue[["project", "part_code", "priority", "planning_gap", "demand_pattern", "top_customer"]].rename(
                columns={"project": "Project", "part_code": "Part", "priority": "Action", "planning_gap": "Uncovered 3-mo qty", "demand_pattern": "Pattern", "top_customer": "Largest account"})
            queue_view["Uncovered 3-mo qty"] = queue_view["Uncovered 3-mo qty"].round(0).astype(int)
            st.dataframe(queue_view, use_container_width=True, hide_index=True, height=285)
        else:
            st.success("No forecast gap against open demand in the current scope.")
    with meeting_col:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        st.markdown('<div class="scp-section-label">Customer meeting prompts</div>', unsafe_allow_html=True)
        meeting_overdue = breakdown_f[breakdown_f["relationship_status"] == "Overdue / went quiet"] if len(breakdown_f) else pd.DataFrame()
        meeting_due = breakdown_f[breakdown_f["relationship_status"] == "Due soon"] if len(breakdown_f) else pd.DataFrame()
        st.markdown(f'<div class="scp-alert"><b>{len(meeting_overdue)} relationship(s) went quiet</b><br>Use the customer view to prepare a recovery conversation.</div>', unsafe_allow_html=True)
        st.markdown(f'<div class="scp-alert scp-alert-amber"><b>{len(meeting_due)} relationship(s) due soon</b><br>These are the best near-term follow-up opportunities.</div>', unsafe_allow_html=True)
        st.markdown('</div>', unsafe_allow_html=True)
    st.markdown('<div class="scp-section-label">What matters most in this scope</div>', unsafe_allow_html=True)
    ranking_col, customer_col = st.columns([1.35, 1])
    with ranking_col:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        st.markdown('<div class="scp-section-label">Top parts by revenue exposure</div>', unsafe_allow_html=True)
        top_part_display = top_parts[["project", "part_code", "part_desc", "revenue", "total_qty", "forecast_monthly_qty", "demand_pattern", "top_customer"]].head(8).rename(
            columns={"project": "Project", "part_code": "Part", "part_desc": "Description", "revenue": "Revenue", "total_qty": "Historical qty", "forecast_monthly_qty": "Forecast / mo", "demand_pattern": "Pattern", "top_customer": "Largest account"})
        top_part_event = st.dataframe(top_part_display.round({"Revenue": 0, "Historical qty": 0, "Forecast / mo": 1}), use_container_width=True, hide_index=True,
                                       on_select="rerun", selection_mode="single-row", key="overview_top_parts")
        st.markdown('</div>', unsafe_allow_html=True)
    with customer_col:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        st.markdown('<div class="scp-section-label">Top customers by revenue</div>', unsafe_allow_html=True)
        top_customer_display = top_customers[["cust_name", "total_revenue", "distinct_parts", "recency_days", "currently_open_qty"]].head(8).rename(
            columns={"cust_name": "Customer", "total_revenue": "Revenue", "distinct_parts": "Parts", "recency_days": "Days since order", "currently_open_qty": "Open qty"})
        top_customer_event = st.dataframe(top_customer_display.round({"Revenue": 0, "Open qty": 0}), use_container_width=True, hide_index=True,
                                           on_select="rerun", selection_mode="single-row", key="overview_top_customers")
        st.markdown('</div>', unsafe_allow_html=True)
    selected_top_part = None
    selected_top_customer = None
    if top_part_event.selection.rows:
        selected_top_part = top_parts.iloc[top_part_event.selection.rows[0]]
    if top_customer_event.selection.rows:
        selected_top_customer = top_customers.iloc[top_customer_event.selection.rows[0]]
    if selected_top_part is not None or selected_top_customer is not None:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        st.markdown('<div class="scp-section-label">Why this is important</div>', unsafe_allow_html=True)
        if selected_top_part is not None:
            part = selected_top_part
            concentration = part.get("top_customer_pct_of_demand", np.nan)
            concentration_text = f"{concentration:.0f}% of this part's demand comes from {part.get('top_customer', 'the largest account')}" if pd.notna(concentration) else "Customer concentration is unavailable"
            st.markdown(f"**Part {part['part_code']} ({part['project']})** is ranked here because it has **${part['revenue']:,.0f} historical revenue exposure** and **{part['total_qty']:,.0f} historical units**. Its modeled demand is **{part['forecast_monthly_qty']:,.1f} units/month**, with **{part.get('forecast_next_3mo_qty', 0):,.1f} units forecast over three months**. {concentration_text}. The demand pattern is **{part['demand_pattern']}**, which determines how cautiously the forecast should be used.")
        if selected_top_customer is not None:
            customer = selected_top_customer
            customer_rows = breakdown_f[breakdown_f["cust_name"] == customer["cust_name"]]
            overdue_count = int((customer_rows["relationship_status"] == "Overdue / went quiet").sum()) if len(customer_rows) else 0
            st.markdown(f"**Customer {customer['cust_name']}** is ranked here because they represent **${customer['total_revenue']:,.0f} revenue**, order **{customer['distinct_parts']} parts**, and have **{customer['currently_open_qty']:,.0f} open units**. Their last order was **{customer['recency_days']} days ago**; **{overdue_count} part relationship(s)** are currently overdue. Click the customer in **Customer Intelligence** for the full order and monthly trend detail.")
        st.markdown('</div>', unsafe_allow_html=True)
    st.markdown('<br>', unsafe_allow_html=True)
    col_a, col_b = st.columns(2)
    with col_a:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        st.markdown('<div class="scp-section-label">Demand pattern distribution</div>', unsafe_allow_html=True)
        st.plotly_chart(pattern_distribution_chart(part_intel_f), use_container_width=True, config={"displayModeBar": False})
        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="scp-section-label">Forecast by future month</div>', unsafe_allow_html=True)
    if len(forecasts_f):
        forecast_view = forecasts_f[["project", "part_code", "demand_pattern", "forecast_monthly_qty", "forecast_method", "months_of_history"]].copy()
        forecast_view[forecast_month_labels[0]] = forecast_view["forecast_monthly_qty"]
        forecast_view[forecast_month_labels[1]] = forecast_view["forecast_monthly_qty"]
        forecast_view[forecast_month_labels[2]] = forecast_view["forecast_monthly_qty"]
        forecast_view["3-month total"] = forecast_view["forecast_monthly_qty"] * 3
        forecast_view = forecast_view.rename(columns={"project": "Project", "part_code": "Part", "demand_pattern": "Pattern", "forecast_method": "Method", "months_of_history": "History (mo)"})
        forecast_view = forecast_view[["Project", "Part", "Pattern", *forecast_month_labels, "3-month total", "Method", "History (mo)"]]
        st.dataframe(forecast_view.round({label: 1 for label in [*forecast_month_labels, "3-month total"]}), use_container_width=True, hide_index=True, height=300)
    else:
        st.info("No forecast data is available for this scope.")
    with col_b:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        if project_filter == "All":
            st.markdown('<div class="scp-section-label">Order value by project</div>', unsafe_allow_html=True)
            st.plotly_chart(project_comparison_chart(demand_lines_f), use_container_width=True, config={"displayModeBar": False})
        else:
            st.markdown('<div class="scp-section-label">Forecast accuracy distribution</div>', unsafe_allow_html=True)
            if len(accuracy_f) > 0:
                fig = go.Figure(go.Histogram(x=accuracy_f["occurrence_hit_rate_pct"], marker=dict(color="#5EEAD4"), nbinsx=10))
                fig.update_layout(plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
                                   font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
                                   xaxis=dict(gridcolor="#1E293B", title="Hit rate %"), yaxis=dict(gridcolor="#1E293B", title="Parts"),
                                   margin=dict(l=40, r=20, t=10, b=30), height=240)
                st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
            else:
                st.caption("Not enough history yet to show accuracy distribution.")
        st.markdown('</div>', unsafe_allow_html=True)

    col_c, col_d = st.columns(2)
    with col_c:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        st.markdown('<div class="scp-section-label">Top movers (year over year)</div>', unsafe_allow_html=True)
        py = yearly_trend_direction(part_yearly_f, ["project", "part_code"])
        movers = py[py["yoy_change_pct"].notna()].copy()
        growing = movers[movers["trend_direction"] == "Growing"].sort_values("yoy_change_pct", ascending=False).head(5)
        declining = movers[movers["trend_direction"] == "Declining"].sort_values("yoy_change_pct").head(5)
        st.caption("Growing")
        for _, r in growing.iterrows():
            st.markdown(f'<div class="scp-row-item"><span>{r["part_code"]}</span><span class="scp-mono" style="color:#34D399;">+{r["yoy_change_pct"]:.0f}%</span></div>', unsafe_allow_html=True)
        if len(growing) == 0:
            st.caption("None crossing the threshold yet.")
        st.caption("Declining")
        for _, r in declining.iterrows():
            st.markdown(f'<div class="scp-row-item"><span>{r["part_code"]}</span><span class="scp-mono" style="color:#F43F5E;">{r["yoy_change_pct"]:.0f}%</span></div>', unsafe_allow_html=True)
        if len(declining) == 0:
            st.caption("None crossing the threshold yet.")
        st.markdown('</div>', unsafe_allow_html=True)
    with col_d:
        st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
        st.markdown('<div class="scp-section-label">Relationship watchlist (overdue)</div>', unsafe_allow_html=True)
        overdue = breakdown_f[breakdown_f["relationship_status"] == "Overdue / went quiet"].sort_values("days_since_last_order", ascending=False).head(8)
        if len(overdue) > 0:
            for _, r in overdue.iterrows():
                st.markdown(f'<div class="scp-row-item"><span>{r["cust_name"]} &middot; {r["part_code"]}</span><span class="scp-mono" style="color:#F43F5E;">{int(r["days_since_last_order"])}d</span></div>', unsafe_allow_html=True)
        else:
            st.caption("No overdue relationships in scope right now.")
        st.markdown('</div>', unsafe_allow_html=True)

# ===========================================================================
# CUSTOMER INTELLIGENCE
# ===========================================================================
with tab_customer:
    col_list, col_detail = st.columns([1, 1.6])
    with col_list:
        st.markdown('<div class="scp-section-label">Customers</div>', unsafe_allow_html=True)
        search = st.text_input("Search customer", label_visibility="collapsed", placeholder="Search customer...")
        cp = customer_profiles_f.copy().reset_index(drop=True)
        if search:
            cp = cp[cp["cust_name"].str.contains(search, case=False, na=False)].reset_index(drop=True)
        cp_display = cp[["cust_name", "total_revenue", "recency_days", "currently_open_lines"]].rename(
            columns={"cust_name": "Customer", "total_revenue": "Revenue", "recency_days": "Days Since Order", "currently_open_lines": "Open Lines"})
        st.markdown('<div class="scp-hint">Click a row to see full profile</div>', unsafe_allow_html=True)
        cust_event = st.dataframe(cp_display, use_container_width=True, height=380, hide_index=True,
                                    on_select="rerun", selection_mode="single-row", key="customer_table")
        selected_customer = None
        if cust_event.selection.rows:
            selected_customer = cp.iloc[cust_event.selection.rows[0]]["cust_name"]

    with col_detail:
        if selected_customer:
            prof = customer_profiles[customer_profiles["cust_name"] == selected_customer].iloc[0]
            st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
            st.markdown(f"### {selected_customer}")
            c1, c2, c3, c4 = st.columns(4)
            c1.markdown(f'<div class="scp-kpi-label">Revenue</div><div class="scp-kpi-value scp-mono">${prof["total_revenue"]:,.0f}</div>', unsafe_allow_html=True)
            c2.markdown(f'<div class="scp-kpi-label">Avg Order Gap</div><div class="scp-kpi-value scp-mono">{prof["avg_order_interval_days"] or "-"} d</div>', unsafe_allow_html=True)
            c3.markdown(f'<div class="scp-kpi-label">Parts Ordered</div><div class="scp-kpi-value scp-mono">{prof["distinct_parts"]}</div>', unsafe_allow_html=True)
            c4.markdown(f'<div class="scp-kpi-label">Open Qty</div><div class="scp-kpi-value scp-mono">{prof["currently_open_qty"]:.0f}</div>', unsafe_allow_html=True)
            st.markdown("<br>", unsafe_allow_html=True)

            st.markdown('<div class="scp-section-label">Parts this customer orders (in scope)</div>', unsafe_allow_html=True)
            cust_parts = breakdown_f[breakdown_f["cust_name"] == selected_customer].sort_values("cust_qty", ascending=False)
            if len(cust_parts) > 0:
                for part_index, (_, row) in enumerate(cust_parts.iterrows()):
                    pc1, pc2, pc3, pc4 = st.columns([2, 1, 1, .7])
                    desc_rows = part_intel[(part_intel["project"] == row["project"]) & (part_intel["part_code"] == row["part_code"])]
                    part_desc = desc_rows.iloc[0].get("part_desc", "") if len(desc_rows) else ""
                    desc_text = f' <span style="color:#94A3B8;">· {part_desc}</span>' if pd.notna(part_desc) and part_desc else ""
                    pc1.markdown(f'**{row["part_code"]}** <span class="scp-mono" style="color:#64748B;font-size:12px;">({row["project"]})</span>{desc_text}', unsafe_allow_html=True)
                    pc2.markdown(status_pill(row["relationship_status"]), unsafe_allow_html=True)
                    pc3.markdown(f'<span class="scp-mono">{row["cust_qty"]:.0f} units</span>', unsafe_allow_html=True)
                    if pc4.button("Inspect", key=f"inspect_{selected_customer}_{row['project']}_{row['part_code']}_{part_index}"):
                        show_part_insight(row["project"], row["part_code"], selected_customer)
            else:
                st.caption("No parts for this customer in the current project scope.")

            st.markdown("<br>", unsafe_allow_html=True)
            st.markdown('<div class="scp-section-label">Recent order history</div>', unsafe_allow_html=True)
            hist = demand_lines_f[demand_lines_f["cust_name"] == selected_customer].sort_values("so_date", ascending=False).head(10)
            if len(hist) > 0:
                hist_display = hist[["so_no", "so_date", "part_code", "original_qty", "status"]].rename(
                    columns={"so_no": "SO No.", "so_date": "Date", "part_code": "Part", "original_qty": "Qty", "status": "Status"})
                st.dataframe(hist_display, use_container_width=True, hide_index=True, height=280)
            else:
                st.caption("No order history in scope.")

            st.markdown("<br>", unsafe_allow_html=True)
            st.markdown('<div class="scp-section-label">Revenue by year</div>', unsafe_allow_html=True)
            cy = cust_yearly[cust_yearly["cust_name"] == selected_customer]
            if project_filter != "All":
                cy = cy[cy["project"] == project_filter]
            if len(cy) > 0:
                year_cols = sorted([c for c in cy.columns if c.isdigit()])
                for _, r in cy.iterrows():
                    st.plotly_chart(yearly_bar_chart(r, year_cols, title=str(r["project"])), use_container_width=True, config={"displayModeBar": False})
            st.markdown('</div>', unsafe_allow_html=True)
        else:
            st.info("Click a customer row on the left to see their full profile.")

# ===========================================================================
# PART INTELLIGENCE
# ===========================================================================
with tab_part:
    col_list, col_detail = st.columns([1, 1.6])
    with col_list:
        st.markdown('<div class="scp-section-label">Parts (scoped to selected project)</div>', unsafe_allow_html=True)
        search_p = st.text_area("Search parts", label_visibility="collapsed", placeholder="Search part codes or descriptions; separate multiple terms with commas, semicolons, or new lines...", height=68)
        pi = part_intel_f.copy().reset_index(drop=True)
        if search_p:
            pi = pi[multi_search_mask(pi, search_p, ["part_code", "part_desc"])].reset_index(drop=True)
        pi_display = pi[["part_code", "project", "part_desc", "demand_pattern", "forecast_monthly_qty", "top_customer"]].rename(
            columns={"part_code": "Part", "project": "Project", "part_desc": "Description", "demand_pattern": "Pattern", "forecast_monthly_qty": "Fcst/mo", "top_customer": "Top Customer"})
        st.markdown('<div class="scp-hint">Search multiple terms with commas, semicolons, or new lines. Click one row for full detail, or multiple to compare.</div>', unsafe_allow_html=True)
        part_event = st.dataframe(pi_display, use_container_width=True, height=380, hide_index=True,
                                    on_select="rerun", selection_mode="multi-row", key="part_table")
        selected_indices = part_event.selection.rows

    with col_detail:
        if not selected_indices:
            st.info("Click part row(s) on the left. Select multiple to compare them side by side.")

        elif len(selected_indices) == 1:
            sel = pi.iloc[selected_indices[0]]
            sel_part_code, sel_project = sel["part_code"], sel["project"]
            row = part_intel[(part_intel["part_code"] == sel_part_code) & (part_intel["project"] == sel_project)].iloc[0]
            st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
            st.markdown(f"### {sel_part_code}")
            if pd.notna(row.get("part_desc")):
                st.markdown(f'<div class="scp-desc">{row["part_desc"]}</div>', unsafe_allow_html=True)
            st.markdown(pattern_pill(row["demand_pattern"]), unsafe_allow_html=True)
            st.markdown("<br>", unsafe_allow_html=True)

            c1, c2, c3, c4 = st.columns(4)
            c1.markdown(f'<div class="scp-kpi-label">Forecast / Month</div><div class="scp-kpi-value scp-mono">{row["forecast_monthly_qty"]:.1f}</div>', unsafe_allow_html=True)
            occ_prob = row.get("occurrence_probability_this_month")
            c2.markdown(f'<div class="scp-kpi-label">Occurrence Prob.</div><div class="scp-kpi-value scp-mono">{occ_prob if pd.notna(occ_prob) else "-"}</div>', unsafe_allow_html=True)
            c3.markdown(f'<div class="scp-kpi-label">Top Customer</div><div class="scp-kpi-value scp-mono" style="font-size:15px;">{row["top_customer"]}</div>', unsafe_allow_html=True)
            c4.markdown(f'<div class="scp-kpi-label">Concentration</div><div class="scp-kpi-value scp-mono">{row["top_customer_pct_of_demand"]:.0f}%</div>', unsafe_allow_html=True)

            st.markdown("<br>", unsafe_allow_html=True)
            st.markdown('<div class="scp-section-label">Monthly demand</div>', unsafe_allow_html=True)
            part_monthly = monthly_demand[(monthly_demand["part_code"] == sel_part_code) & (monthly_demand["project"] == sel_project)].sort_values("month")
            if len(part_monthly) > 0:
                st.plotly_chart(waveform_chart(part_monthly), use_container_width=True, config={"displayModeBar": False})

            py_row = part_yearly[(part_yearly["part_code"] == sel_part_code) & (part_yearly["project"] == sel_project)]
            if len(py_row) > 0:
                year_cols = sorted([c for c in py_row.columns if c.isdigit()])
                st.markdown('<div class="scp-section-label">Yearly trend</div>', unsafe_allow_html=True)
                st.plotly_chart(yearly_bar_chart(py_row.iloc[0], year_cols), use_container_width=True, config={"displayModeBar": False})

            st.markdown('<div class="scp-section-label">Customer breakdown - click a customer for their trend on this part</div>', unsafe_allow_html=True)
            part_custs = breakdown[(breakdown["part_code"] == sel_part_code) & (breakdown["project"] == sel_project)].sort_values("cust_qty", ascending=False).reset_index(drop=True)
            part_custs_display = part_custs[["cust_name", "cust_qty", "pct_of_part_demand", "relationship_status"]].rename(
                columns={"cust_name": "Customer", "cust_qty": "Qty", "pct_of_part_demand": "% of Demand", "relationship_status": "Status"})
            cust_in_part_event = st.dataframe(part_custs_display, use_container_width=True, hide_index=True,
                                                on_select="rerun", selection_mode="single-row", key="part_customer_table")
            if cust_in_part_event.selection.rows:
                sel_cust = part_custs.iloc[cust_in_part_event.selection.rows[0]]["cust_name"]
                cust_part_hist = demand_lines[(demand_lines["part_code"] == sel_part_code) &
                                                (demand_lines["project"] == sel_project) &
                                                (demand_lines["cust_name"] == sel_cust)].copy()
                cust_part_hist["so_date"] = pd.to_datetime(cust_part_hist["so_date"], errors="coerce")
                cust_part_hist = cust_part_hist.dropna(subset=["so_date"])
                cust_part_hist["order_month"] = cust_part_hist["so_date"].dt.to_period("M").astype(str)
                by_month = (cust_part_hist.groupby("order_month", as_index=False)
                             .agg(quantity=("original_qty", "sum"), orders=("so_no", "nunique"))
                             .sort_values("order_month"))
                st.markdown(f'<div class="scp-section-label">{sel_cust} - monthly order trend for {sel_part_code}</div>', unsafe_allow_html=True)
                if len(by_month) > 0:
                    trend_col, detail_col = st.columns([1.35, 1])
                    with trend_col:
                        fig = go.Figure(go.Bar(x=by_month["order_month"], y=by_month["quantity"], marker=dict(color="#FB923C"),
                                               customdata=by_month[["orders"]], hovertemplate="%{x}<br>Quantity: %{y:,.0f}<br>Orders: %{customdata[0]}<extra></extra>"))
                        fig.update_layout(title=dict(text="Quantity ordered by month", font=dict(family="IBM Plex Mono", size=12, color="#64748B")),
                                          plot_bgcolor="#0A0E17", paper_bgcolor="rgba(0,0,0,0)",
                                          font=dict(family="IBM Plex Mono", color="#E2E8F0", size=11),
                                          xaxis=dict(gridcolor="#1E293B", title="Order month"),
                                          yaxis=dict(gridcolor="#1E293B", title="Quantity"),
                                          margin=dict(l=40, r=20, t=40, b=45), height=260, showlegend=False)
                        st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
                    with detail_col:
                        trend_display = by_month.rename(columns={"order_month": "Month", "quantity": "Qty Ordered", "orders": "Orders"})
                        st.dataframe(trend_display, use_container_width=True, hide_index=True, height=260)
                    st.markdown('<div class="scp-section-label">Order-level detail</div>', unsafe_allow_html=True)
                    order_display = cust_part_hist.sort_values("so_date", ascending=False)
                    order_columns = [c for c in ["so_no", "so_date", "original_qty", "shipped_qty", "open_qty", "status"] if c in order_display.columns]
                    order_display = order_display[order_columns].rename(columns={
                        "so_no": "SO No.", "so_date": "Order Date", "original_qty": "Ordered Qty",
                        "shipped_qty": "Shipped Qty", "open_qty": "Open Qty", "status": "Status"})
                    st.dataframe(order_display, use_container_width=True, hide_index=True, height=240)
                else:
                    st.info("No dated orders are available for this customer and part.")

            tp_row = tuned_params[(tuned_params["part_code"] == sel_part_code) & (tuned_params["project"] == sel_project)]
            acc_row = accuracy[(accuracy["part_code"] == sel_part_code) & (accuracy["project"] == sel_project)]
            if len(tp_row) > 0 or len(acc_row) > 0:
                st.markdown("<br>", unsafe_allow_html=True)
                st.markdown('<div class="scp-section-label">Forecast diagnostics</div>', unsafe_allow_html=True)
                if len(acc_row) > 0:
                    a = acc_row.iloc[0]
                    st.caption(f"Backtested: {a['occurrence_hit_rate_pct']}% occurrence hit rate over {a['num_test_points']} test months (avg magnitude error {a['avg_magnitude_error_pct']}%)")
                if len(tp_row) > 0:
                    t = tp_row.iloc[0]
                    baseline_note = "meets/beats baseline" if t["met_baseline"] else "below baseline (limited history)"
                    st.caption(f"Tuned params: alpha={t['tuned_alpha']}, beta={t['tuned_beta']}, threshold={t['tuned_threshold']} ({baseline_note})")
            st.markdown('</div>', unsafe_allow_html=True)

        else:
            # COMPARISON VIEW for multiple selected parts
            sel_rows = pi.iloc[selected_indices]
            st.markdown('<div class="scp-panel">', unsafe_allow_html=True)
            st.markdown(f"### Comparing {len(sel_rows)} parts")

            compare_rows = []
            series_for_chart = []
            for _, sel in sel_rows.iterrows():
                full_row = part_intel[(part_intel["part_code"] == sel["part_code"]) & (part_intel["project"] == sel["project"])].iloc[0]
                compare_rows.append({
                    "Part": sel["part_code"], "Project": sel["project"], "Pattern": full_row["demand_pattern"],
                    "Fcst/mo": full_row["forecast_monthly_qty"], "Top Customer": full_row["top_customer"],
                    "Concentration": f'{full_row["top_customer_pct_of_demand"]:.0f}%',
                    "Total Qty": full_row["total_qty"],
                })
                mdf = monthly_demand[(monthly_demand["part_code"] == sel["part_code"]) & (monthly_demand["project"] == sel["project"])].sort_values("month")
                if len(mdf) > 0:
                    series_for_chart.append((f'{sel["part_code"]} ({sel["project"]})', mdf))

            st.dataframe(pd.DataFrame(compare_rows), use_container_width=True, hide_index=True)
            st.markdown("<br>", unsafe_allow_html=True)
            st.markdown('<div class="scp-section-label">Monthly demand - overlaid</div>', unsafe_allow_html=True)
            if series_for_chart:
                st.plotly_chart(multi_waveform_chart(series_for_chart), use_container_width=True, config={"displayModeBar": False})
            st.markdown('</div>', unsafe_allow_html=True)

# ===========================================================================
# REPLENISHMENT
# ===========================================================================
with tab_replen:
    st.markdown("### Demand planning queue")
    st.markdown('<div class="scp-desc">A three-month forecast gap is a planning signal, not a purchase recommendation. Add on-hand inventory, open supplier POs, lead time, and MOQ to make this a true replenishment engine.</div>', unsafe_allow_html=True)
    if len(signals_f):
        action_filter = st.multiselect("Show actions", ["Review", "Plan", "Monitor"], default=["Review", "Plan"], label_visibility="collapsed")
        visible = signals_f[signals_f["priority"].isin(action_filter)]
        horizon_col = [c for c in visible.columns if c.startswith("forecast_next_")]
        horizon_col = horizon_col[0] if horizon_col else None
        if len(visible):
            replen_view = visible[["project", "part_code", "priority", "demand_pattern", "forecast_monthly_qty", horizon_col, "open_qty", "planning_gap", "top_customer", "top_customer_pct_of_demand"]].copy()
            replen_view[forecast_month_labels[0]] = replen_view["forecast_monthly_qty"]
            replen_view[forecast_month_labels[1]] = replen_view["forecast_monthly_qty"]
            replen_view[forecast_month_labels[2]] = replen_view["forecast_monthly_qty"]
            replen_view = replen_view.rename(columns={"project": "Project", "part_code": "Part", "priority": "Action", "demand_pattern": "Pattern", "forecast_monthly_qty": "Forecast / mo", horizon_col: "Forecast / 3 mo", "open_qty": "Open demand", "planning_gap": "Planning gap", "top_customer": "Largest account", "top_customer_pct_of_demand": "Account share %"})
            replen_view = replen_view[["Project", "Part", "Action", "Pattern", *forecast_month_labels, "Forecast / 3 mo", "Open demand", "Planning gap", "Largest account", "Account share %"]]
            st.dataframe(replen_view.round({label: 0 for label in [*forecast_month_labels, "Forecast / 3 mo", "Open demand", "Planning gap", "Account share %"]}), use_container_width=True, hide_index=True, height=430)
        else:
            st.info("No parts match the selected actions.")
    else:
        st.info("No planning data is available for this scope.")

# ===========================================================================
# AI COPILOT (placeholder)
# ===========================================================================
with tab_ai:
    st.markdown("""
    <div class="scp-soon">
        <div style="font-family:'Space Grotesk',sans-serif; font-size:20px; margin-bottom:8px;">AI Copilot</div>
        <div style="color:#64748B;">Next build step - a chat interface here will call tools that query
        this same database, so every answer traces back to the tables you're already looking at.</div>
    </div>
    """, unsafe_allow_html=True)
