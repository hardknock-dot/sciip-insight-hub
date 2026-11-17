"""
SCIIP - Pipeline Orchestrator
This is the script you run every time you get a fresh Sales Register export.

    python pipeline.py path/to/sales_register_export.xlsx

Storage note: using SQLite here only because the build sandbox has no
internet to install DuckDB. Swapping storage engines later is a small,
contained change - this pipeline structure does not change either way.
"""
import sys
import sqlite3
from pathlib import Path
from datetime import datetime

import pandas as pd

from ingest import load_sales_register
from transaction_engine import reconstruct_full_register, reconstruct_consignment_lines
from intelligence import (build_part_monthly_demand, classify_demand_patterns, build_customer_profile,
                            build_part_yearly_trend, build_customer_yearly_trend,
                            build_part_customer_breakdown, build_part_customer_concentration,
                            build_part_intelligence_summary, add_relationship_health)
from forecasting import generate_forecasts, backtest_accuracy, build_part_monthly_pivot, tune_forecast_parameters

DB_PATH = Path(__file__).parent / "data" / "sciip.db"
OUTPUT_DIR = Path(__file__).parent / "outputs"

# Only these projects are in scope for SCIIP right now. Adjust this list any
# time - everything else in the pipeline stays the same.
PROJECT_ALLOWLIST = ["ETCH", "INOVA", "SP-203"]


def run_pipeline(input_filepath: str):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    run_timestamp = datetime.now().isoformat(timespec="seconds")
    print(f"[{run_timestamp}] SCIIP pipeline starting")
    print(f"Input file: {input_filepath}")

    # 1. Ingest
    print("\n--- Step 1: Ingestion ---")
    clean_df, report = load_sales_register(input_filepath)
    print(report.summary())

    pre_filter_count = len(clean_df)
    clean_df = clean_df[clean_df["project"].isin(PROJECT_ALLOWLIST)].reset_index(drop=True)
    excluded_by_project = pre_filter_count - len(clean_df)
    print(f"\nProject filter: keeping {PROJECT_ALLOWLIST}")
    print(f"Rows excluded by project filter: {excluded_by_project} "
          f"({len(clean_df)} rows remain for the engine)")

    # 2. Reconstruct - consignment orders use a direct SO-vs-Invoice path,
    #    everything else uses the DO-matching Transaction State Engine
    print("\n--- Step 2: Transaction State Engine ---")
    is_consignment = clean_df["buy_ord_ref"].fillna("").str.strip().str.lower().str.startswith("skyline consignment")
    consignment_df = clean_df[is_consignment]
    normal_df = clean_df[~is_consignment]

    normal_lines = reconstruct_full_register(normal_df) if len(normal_df) else pd.DataFrame()
    consignment_lines = reconstruct_consignment_lines(consignment_df) if len(consignment_df) else pd.DataFrame()
    demand_lines = pd.concat([normal_lines, consignment_lines], ignore_index=True)

    print(f"Reconstructed {len(demand_lines)} original demand lines "
          f"({len(normal_lines)} standard + {len(consignment_lines)} consignment) "
          f"from {len(clean_df)} register rows "
          f"({demand_lines['status'].eq('CLOSED').sum()} closed, "
          f"{demand_lines['status'].eq('OPEN').sum()} open)")

    # 3. Demand & Customer Intelligence
    print("\n--- Step 3: Demand & Customer Intelligence ---")
    monthly_demand = build_part_monthly_demand(demand_lines)
    pattern_classification = classify_demand_patterns(monthly_demand)
    customer_profile = build_customer_profile(demand_lines)
    part_yearly_trend = build_part_yearly_trend(demand_lines)
    customer_yearly_trend = build_customer_yearly_trend(demand_lines)
    pattern_counts = pattern_classification["demand_pattern"].value_counts().to_dict()
    print(f"Classified {len(pattern_classification)} project+part combinations: {pattern_counts}")
    print(f"Built behavior profiles for {len(customer_profile)} customers")
    print(f"Built year-wise trend for {len(part_yearly_trend)} project+part combinations "
          f"and {len(customer_yearly_trend)} customer+project combinations")

    tuned_params = tune_forecast_parameters(monthly_demand, pattern_classification, min_history=6)
    if len(tuned_params) > 0:
        pct_met_baseline = 100 * tuned_params["met_baseline"].mean()
        print(f"Tuned parameters for {len(tuned_params)} project+part combinations "
              f"({pct_met_baseline:.0f}% meet/beat their own naive baseline)")
    else:
        print("Not enough history yet to tune any parts (need 8+ months of data per part) - using defaults")

    forecasts = generate_forecasts(monthly_demand, pattern_classification, tuned_params=tuned_params, horizon_months=3)
    print(f"Generated forecasts for {len(forecasts)} project+part combinations")

    customer_breakdown = build_part_customer_breakdown(demand_lines)
    customer_breakdown = add_relationship_health(customer_breakdown)
    concentration = build_part_customer_concentration(customer_breakdown)
    part_intelligence = build_part_intelligence_summary(pattern_classification, forecasts, concentration)
    print(f"Built customer-concentration context for {len(concentration)} project+part combinations")
    print(f"Consolidated Part Intelligence summary: {len(part_intelligence)} rows (dashboard-ready)")
    status_counts = customer_breakdown["relationship_status"].value_counts().to_dict()
    print(f"Relationship health: {status_counts}")

    accuracy = backtest_accuracy(monthly_demand, pattern_classification, min_history=6)
    monthly_pivot = build_part_monthly_pivot(monthly_demand)
    if len(accuracy) > 0:
        avg_hit_rate = accuracy["occurrence_hit_rate_pct"].mean()
        print(f"Backtested accuracy for {len(accuracy)} project+part combinations "
              f"(avg occurrence hit rate: {avg_hit_rate:.1f}%) - see 'Forecast Accuracy' sheet")
    else:
        print("Not enough history yet to backtest any parts (need 7+ months of data per part)")

    # 4. Store (full replace each run - confirmed export is always full history)
    print("\n--- Step 4: Storage ---")
    conn = sqlite3.connect(DB_PATH)
    clean_df_store = clean_df.copy()
    for col in clean_df_store.columns:
        if pd.api.types.is_datetime64_any_dtype(clean_df_store[col]):
            clean_df_store[col] = clean_df_store[col].dt.strftime("%Y-%m-%d")
    clean_df_store["_ingested_at"] = run_timestamp
    clean_df_store.to_sql("raw_sales_register", conn, if_exists="replace", index=False)

    demand_lines_store = demand_lines.copy()
    demand_lines_store["_computed_at"] = run_timestamp
    for col in demand_lines_store.columns:
        if pd.api.types.is_datetime64_any_dtype(demand_lines_store[col]):
            demand_lines_store[col] = demand_lines_store[col].dt.strftime("%Y-%m-%d")
    demand_lines_store.to_sql("demand_lines", conn, if_exists="replace", index=False)

    pattern_store = pattern_classification.copy()
    pattern_store["_computed_at"] = run_timestamp
    pattern_store.to_sql("part_demand_patterns", conn, if_exists="replace", index=False)

    customer_store = customer_profile.copy()
    for col in customer_store.columns:
        if pd.api.types.is_datetime64_any_dtype(customer_store[col]):
            customer_store[col] = customer_store[col].dt.strftime("%Y-%m-%d")
    customer_store["_computed_at"] = run_timestamp
    customer_store.to_sql("customer_profiles", conn, if_exists="replace", index=False)

    part_trend_store = part_yearly_trend.copy()
    part_trend_store["_computed_at"] = run_timestamp
    part_trend_store.to_sql("part_yearly_trend", conn, if_exists="replace", index=False)

    cust_trend_store = customer_yearly_trend.copy()
    cust_trend_store["_computed_at"] = run_timestamp
    cust_trend_store.to_sql("customer_yearly_trend", conn, if_exists="replace", index=False)

    forecast_store = forecasts.copy()
    forecast_store["_computed_at"] = run_timestamp
    forecast_store.to_sql("part_forecasts", conn, if_exists="replace", index=False)

    monthly_store = monthly_demand.copy()
    monthly_store["month"] = monthly_store["month"].astype(str)
    monthly_store["_computed_at"] = run_timestamp
    monthly_store.to_sql("part_monthly_demand", conn, if_exists="replace", index=False)

    breakdown_store = customer_breakdown.copy()
    for col in breakdown_store.columns:
        if pd.api.types.is_datetime64_any_dtype(breakdown_store[col]):
            breakdown_store[col] = breakdown_store[col].dt.strftime("%Y-%m-%d")
    breakdown_store["_computed_at"] = run_timestamp
    breakdown_store.to_sql("part_customer_breakdown", conn, if_exists="replace", index=False)

    concentration_store = concentration.copy()
    for col in concentration_store.columns:
        if pd.api.types.is_datetime64_any_dtype(concentration_store[col]):
            concentration_store[col] = concentration_store[col].dt.strftime("%Y-%m-%d")
    concentration_store["_computed_at"] = run_timestamp
    concentration_store.to_sql("part_customer_concentration", conn, if_exists="replace", index=False)

    part_intel_store = part_intelligence.copy()
    for col in part_intel_store.columns:
        if pd.api.types.is_datetime64_any_dtype(part_intel_store[col]):
            part_intel_store[col] = part_intel_store[col].dt.strftime("%Y-%m-%d")
    part_intel_store["_computed_at"] = run_timestamp
    part_intel_store.to_sql("part_intelligence_summary", conn, if_exists="replace", index=False)

    accuracy_store = accuracy.copy()
    accuracy_store["_computed_at"] = run_timestamp
    accuracy_store.to_sql("part_forecast_accuracy", conn, if_exists="replace", index=False)

    pivot_store = monthly_pivot.copy()
    pivot_store["_computed_at"] = run_timestamp
    pivot_store.to_sql("part_monthly_pivot", conn, if_exists="replace", index=False)

    tuned_params_store = tuned_params.copy()
    tuned_params_store["_computed_at"] = run_timestamp
    tuned_params_store.to_sql("part_tuned_parameters", conn, if_exists="replace", index=False)
    conn.close()

    print(f"Stored to {DB_PATH}: raw_sales_register ({len(clean_df_store)} rows), "
          f"demand_lines ({len(demand_lines_store)} rows), "
          f"part_demand_patterns ({len(pattern_store)} rows), "
          f"part_monthly_demand ({len(monthly_store)} rows), "
          f"part_forecasts ({len(forecast_store)} rows), "
          f"part_customer_breakdown ({len(breakdown_store)} rows), "
          f"part_customer_concentration ({len(concentration_store)} rows), "
          f"part_intelligence_summary ({len(part_intel_store)} rows), "
          f"customer_profiles ({len(customer_store)} rows)")

    # 5. Output report
    print("\n--- Step 5: Report ---")
    report_path = OUTPUT_DIR / f"sciip_demand_lines_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    with pd.ExcelWriter(report_path, engine="openpyxl") as writer:
        demand_lines.to_excel(writer, sheet_name="Demand Lines", index=False)
        open_only = demand_lines[demand_lines["status"] == "OPEN"].sort_values("so_no")
        open_only.to_excel(writer, sheet_name="Open Lines Only", index=False)
        part_intelligence.to_excel(writer, sheet_name="Part Intelligence Summary", index=False)
        pattern_classification.to_excel(writer, sheet_name="Part Demand Patterns", index=False)
        customer_profile.to_excel(writer, sheet_name="Customer Profiles", index=False)
        part_yearly_trend.to_excel(writer, sheet_name="Part Yearly Trend", index=False)
        customer_yearly_trend.to_excel(writer, sheet_name="Customer Yearly Trend", index=False)
        forecasts.to_excel(writer, sheet_name="Part Forecasts", index=False)
        customer_breakdown.to_excel(writer, sheet_name="Part Customer Breakdown", index=False)
        monthly_pivot.to_excel(writer, sheet_name="Part Monthly Reference", index=False)
        accuracy.to_excel(writer, sheet_name="Forecast Accuracy", index=False)
        tuned_params.to_excel(writer, sheet_name="Tuned Parameters", index=False)

        summary = pd.DataFrame({
            "metric": ["Total register rows ingested", "Rows excluded (data issues)",
                       f"Rows excluded (project filter: not in {PROJECT_ALLOWLIST})",
                       "Total demand lines reconstructed", "Closed lines", "Open lines",
                       "Lines needing review (over-shipped/adjusted)",
                       "Total original demand (units)", "Total shipped (units)", "Total still open (units)"],
            "value": [report.row_count_raw, report.row_count_raw - report.row_count_clean - excluded_by_project,
                      excluded_by_project,
                      len(demand_lines), demand_lines["status"].eq("CLOSED").sum(),
                      demand_lines["status"].eq("OPEN").sum(),
                      demand_lines["needs_review"].sum(),
                      demand_lines["original_qty"].sum(), demand_lines["shipped_qty"].sum(),
                      demand_lines["open_qty"].sum()]
        })
        summary.to_excel(writer, sheet_name="Summary", index=False)
    print(f"Report written to {report_path}")

    print(f"\n[{datetime.now().isoformat(timespec='seconds')}] Pipeline complete.")
    return demand_lines, report_path


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pipeline.py <path_to_sales_register_export.xlsx>")
        sys.exit(1)
    run_pipeline(sys.argv[1])
