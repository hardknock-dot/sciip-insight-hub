from __future__ import annotations

from pathlib import Path

import pandas as pd

from modules.forecasting.forecast_engine import (
    ForecastEngine,
)


def load_transaction_data() -> pd.DataFrame:
    """
    Load transaction-state output.

    The runner supports either:
        1. a CSV transaction output
        2. an Excel transaction output
    """

    candidates = [
        Path("outputs/transaction_state.xlsx"),
        Path("outputs/transaction_state.csv"),
        Path("outputs/df_transaction.xlsx"),
        Path("outputs/df_transaction.csv"),
    ]

    for path in candidates:

        if not path.exists():
            continue

        print(
            f"Loading transaction data: {path}"
        )

        if path.suffix.lower() == ".csv":
            return pd.read_csv(path)

        return pd.read_excel(path)

    raise FileNotFoundError(
        "Could not find transaction-state output.\n"
        "Expected one of:\n"
        + "\n".join(
            f"  - {path}"
            for path in candidates
        )
    )


def main() -> None:

    print("=" * 72)
    print("SCIIP FORECASTING ENGINE")
    print("=" * 72)

    transaction_df = load_transaction_data()

    print(
        f"\nTransaction rows loaded : "
        f"{len(transaction_df):,}"
    )

    engine = ForecastEngine()

    result = engine.run(
        transaction_df
    )

    if not result.success:

        print("\nFORECAST FAILED")
        print("-" * 72)

        for error in result.errors:
            print(error)

        raise SystemExit(1)

    forecast_df = result.data

    print(
        f"Forecast records          : "
        f"{len(forecast_df):,}"
    )

    print(
        f"Unique Project + Part     : "
        f"{forecast_df[['Project', 'Part Code']].drop_duplicates().shape[0]:,}"
    )

    print("\nDemand Classification")
    print("-" * 72)

    print(
        forecast_df[
            "Demand_Classification"
        ].value_counts()
        .to_string()
    )

    print("\nForecast Methods")
    print("-" * 72)

    print(
        forecast_df[
            "Forecast_Method"
        ].value_counts()
        .to_string()
    )

    print("\nTop Forecast Records")
    print("-" * 72)

    display_columns = [
        "Project",
        "Part Code",
        "Demand_Occurrence_%",
        "Demand_Classification",
        "Forecast_Method",
        "Forecast_M1",
        "Forecast_M2",
        "Forecast_M3",
        "Forecast_M4",
        "Forecast_M5",
        "Forecast_M6",
        "Trend",
        "Confidence",
    ]

    print(
        forecast_df[
            display_columns
        ]
        .head(20)
        .to_string(index=False)
    )

    output_dir = Path(
        "outputs"
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file = (
        output_dir
        / "SCIIP_Forecast.xlsx"
    )

    with pd.ExcelWriter(
        output_file,
        engine="openpyxl",
    ) as writer:

        forecast_df.to_excel(
            writer,
            sheet_name="Forecast",
            index=False,
        )

        summary = (
            forecast_df[
                [
                    "Project",
                    "Demand_Classification",
                ]
            ]
            .value_counts()
            .reset_index(
                name="Part_Count"
            )
        )

        summary.to_excel(
            writer,
            sheet_name="Classification_Summary",
            index=False,
        )

        method_summary = (
            forecast_df[
                [
                    "Project",
                    "Forecast_Method",
                ]
            ]
            .value_counts()
            .reset_index(
                name="Part_Count"
            )
        )

        method_summary.to_excel(
            writer,
            sheet_name="Method_Summary",
            index=False,
        )

    print(
        f"\nOutput written to:\n"
        f"{output_file}"
    )

    print("\n" + "=" * 72)
    print("SCIIP FORECASTING COMPLETE")
    print("=" * 72)


if __name__ == "__main__":
    main()