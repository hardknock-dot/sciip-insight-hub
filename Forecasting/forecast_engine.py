from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from core.result import ModuleResult

from .forecast_models import (
    croston_sba,
    exponential_smoothing,
    linear_trend_forecast,
    simple_average,
    tsb,
)


@dataclass
class ForecastEngineConfig:
    horizon: int = 6
    alpha: float = 0.10

    adi_intermittent_threshold: float = 1.32
    cv2_erratic_threshold: float = 0.49

    minimum_history_months: int = 3

    occurrence_low_threshold: float = 20.0
    occurrence_high_threshold: float = 70.0


class ForecastEngine:
    """
    SCIIP Forecast Engine.

    Input:
        Transaction-state demand lines.

    Output:
        Exactly one forecast record per Project + Part Code.

    Core principle:
        Forecast original demand, not shipment/DO rows.
    """

    MODULE_NAME = "SCIIP_Forecast_Engine"

    def __init__(
        self,
        config: ForecastEngineConfig | None = None,
    ) -> None:
        self.config = config or ForecastEngineConfig()

    def execute(self, dataframe: pd.DataFrame) -> ModuleResult:
        start = time.perf_counter()

        try:
            if not isinstance(dataframe, pd.DataFrame):
                raise TypeError(
                    "ForecastEngine.execute() expects a pandas DataFrame."
                )

            df = self._prepare_input(dataframe)

            forecast_df = self._build_forecasts(df)

            result = ModuleResult(
                module_name=self.MODULE_NAME,
                success=True,
                data=forecast_df,
                records_processed=len(forecast_df),
                message=(
                    "Forecast generated successfully using demand "
                    "occurrence, ADI/CV2 classification and "
                    "intermittent-demand forecasting."
                ),
            )

            result.execution_time = time.perf_counter() - start

            result.add_metadata(
                "forecast_records",
                len(forecast_df),
            )

            result.add_metadata(
                "forecast_horizon_months",
                self.config.horizon,
            )

            result.add_metadata(
                "unique_project_part_pairs",
                int(
                    forecast_df[
                        ["Project", "Part Code"]
                    ].drop_duplicates().shape[0]
                ),
            )

            return result

        except Exception as exc:
            result = ModuleResult(
                module_name=self.MODULE_NAME,
                success=False,
                data=None,
                records_processed=0,
                message="Forecast generation failed.",
            )

            result.execution_time = time.perf_counter() - start
            result.add_error(str(exc))

            return result

    def run(self, dataframe: pd.DataFrame) -> ModuleResult:
        return self.execute(dataframe)

    # ================================================================
    # INPUT
    # ================================================================

    def _prepare_input(
        self,
        dataframe: pd.DataFrame,
    ) -> pd.DataFrame:

        df = dataframe.copy(deep=True)

        required = [
            "project",
            "part_code",
            "so_date",
            "original_qty",
        ]

        missing = [
            column
            for column in required
            if column not in df.columns
        ]

        if missing:
            raise KeyError(
                "Forecast input missing required columns: "
                + ", ".join(missing)
            )

        df["so_date"] = pd.to_datetime(
            df["so_date"],
            errors="coerce",
        )

        df["original_qty"] = pd.to_numeric(
            df["original_qty"],
            errors="coerce",
        ).fillna(0.0)

        df["original_qty"] = df["original_qty"].clip(
            lower=0.0
        )

        df = df.dropna(
            subset=[
                "project",
                "part_code",
                "so_date",
            ]
        )

        # Only genuine demand lines.
        if "SCIIP_Row_Role" in df.columns:
            df = df[
                df["SCIIP_Row_Role"].eq("DEMAND_ROW")
            ]

        return df

    # ================================================================
    # FORECAST BUILD
    # ================================================================

    def _build_forecasts(
        self,
        dataframe: pd.DataFrame,
    ) -> pd.DataFrame:

        records: list[dict[str, Any]] = []

        grouped = dataframe.groupby(
            ["project", "part_code"],
            dropna=False,
        )

        for (project, part_code), group in grouped:

            group = group.sort_values("so_date")

            monthly = self._build_monthly_series(group)

            if monthly.empty:
                continue

            record = self._forecast_one_part(
                project=project,
                part_code=part_code,
                group=group,
                monthly=monthly,
            )

            records.append(record)

        if not records:
            return self._empty_output()

        result = pd.DataFrame(records)

        # Hard uniqueness guarantee.
        result = (
            result
            .sort_values(
                [
                    "Project",
                    "Part Code",
                ]
            )
            .drop_duplicates(
                subset=[
                    "Project",
                    "Part Code",
                ],
                keep="last",
            )
            .reset_index(drop=True)
        )

        return result

    # ================================================================
    # MONTHLY DEMAND
    # ================================================================

    def _build_monthly_series(
        self,
        group: pd.DataFrame,
    ) -> pd.DataFrame:

        monthly = (
            group.assign(
                month=group["so_date"].dt.to_period("M")
            )
            .groupby("month")
            .agg(
                qty=("original_qty", "sum"),
                demand_lines=(
                    "original_qty",
                    "count",
                ),
            )
        )

        if monthly.empty:
            return pd.DataFrame()

        full_range = pd.period_range(
            monthly.index.min(),
            monthly.index.max(),
            freq="M",
        )

        monthly = monthly.reindex(
            full_range,
            fill_value=0.0,
        )

        monthly.index.name = "month"

        monthly["qty"] = pd.to_numeric(
            monthly["qty"],
            errors="coerce",
        ).fillna(0.0)

        monthly["demand_occurrence"] = (
            monthly["qty"] > 0
        )

        return monthly.reset_index()

    # ================================================================
    # SINGLE PART FORECAST
    # ================================================================

    def _forecast_one_part(
        self,
        project: Any,
        part_code: Any,
        group: pd.DataFrame,
        monthly: pd.DataFrame,
    ) -> dict[str, Any]:

        values = monthly["qty"].to_numpy(
            dtype=float
        )

        periods = len(values)

        demand_months = int(
            np.count_nonzero(values > 0)
        )

        occurrence_pct = (
            demand_months / periods * 100.0
            if periods
            else 0.0
        )

        total_qty = float(values.sum())

        average_active_demand = (
            float(values[values > 0].mean())
            if demand_months
            else 0.0
        )

        adi = (
            periods / demand_months
            if demand_months
            else np.inf
        )

        if demand_months > 1:
            active_values = values[values > 0]

            mean_active = float(
                np.mean(active_values)
            )

            std_active = float(
                np.std(
                    active_values,
                    ddof=0,
                )
            )

            cv2 = (
                (std_active / mean_active) ** 2
                if mean_active > 0
                else 0.0
            )
        else:
            cv2 = 0.0

        classification = self._classify(
            adi=adi,
            cv2=cv2,
        )

        method = self._select_method(
            classification=classification,
            occurrence_pct=occurrence_pct,
        )

        forecast = self._generate_forecast(
            values=values,
            method=method,
        )

        forecast = self._occurrence_forecast_loop(
            values=values,
            forecast=forecast,
            occurrence_pct=occurrence_pct,
            classification=classification,
            method=method,
        )

        trend = self._calculate_trend(
            values
        )

        confidence = self._calculate_confidence(
            values=values,
            occurrence_pct=occurrence_pct,
            periods=periods,
            method=method,
        )

        part_desc = self._get_part_desc(
            group
        )

        record: dict[str, Any] = {
            "Project": project,
            "Part Code": part_code,
            "Part Desc": part_desc,

            "Historical_Months": periods,
            "Demand_Months": demand_months,
            "Demand_Occurrence_%": round(
                occurrence_pct,
                2,
            ),

            "Total_Historical_Demand": round(
                total_qty,
                2,
            ),

            "Average_Demand_When_Active": round(
                average_active_demand,
                2,
            ),

            "ADI": round(
                float(adi),
                2,
            ) if np.isfinite(adi) else np.nan,

            "CV2": round(
                float(cv2),
                4,
            ),

            "Demand_Classification": classification,

            "Forecast_Method": method,

            "Trend": trend,

            "Confidence": confidence,

            "Forecast_Occurrence_Reference_%": round(
                occurrence_pct,
                2,
            ),
        }

        for index, value in enumerate(
            forecast,
            start=1,
        ):
            record[
                f"Forecast_M{index}"
            ] = round(
                max(float(value), 0.0),
                2,
            )

        return record

    # ================================================================
    # CLASSIFICATION
    # ================================================================

    def _classify(
        self,
        adi: float,
        cv2: float,
    ) -> str:

        if not np.isfinite(adi):
            return "NO_DEMAND"

        if (
            adi < self.config.adi_intermittent_threshold
            and cv2 < self.config.cv2_erratic_threshold
        ):
            return "Smooth"

        if (
            adi >= self.config.adi_intermittent_threshold
            and cv2 < self.config.cv2_erratic_threshold
        ):
            return "Intermittent"

        if (
            adi < self.config.adi_intermittent_threshold
            and cv2 >= self.config.cv2_erratic_threshold
        ):
            return "Erratic"

        return "Lumpy"

    # ================================================================
    # METHOD SELECTION
    # ================================================================

    def _select_method(
        self,
        classification: str,
        occurrence_pct: float,
    ) -> str:

        if classification == "NO_DEMAND":
            return "NO_DEMAND"

        if classification == "Smooth":
            return "EXPONENTIAL_SMOOTHING"

        if classification == "Erratic":
            return "EXPONENTIAL_SMOOTHING"

        if classification == "Lumpy":
            return "TSB"

        # Intermittent.
        if occurrence_pct <= (
            self.config.occurrence_low_threshold
        ):
            return "TSB"

        return "CROSTON_SBA"

    # ================================================================
    # MODEL EXECUTION
    # ================================================================

    def _generate_forecast(
        self,
        values: np.ndarray,
        method: str,
    ) -> np.ndarray:

        horizon = self.config.horizon

        if method == "NO_DEMAND":
            return np.zeros(horizon)

        if method == "CROSTON_SBA":
            return croston_sba(
                values,
                horizon=horizon,
                alpha=self.config.alpha,
            )

        if method == "TSB":
            return tsb(
                values,
                horizon=horizon,
                alpha_demand=self.config.alpha,
                alpha_probability=self.config.alpha,
            )

        if method == "EXPONENTIAL_SMOOTHING":
            return exponential_smoothing(
                values,
                horizon=horizon,
                alpha=0.30,
            )

        if method == "LINEAR_TREND":
            return linear_trend_forecast(
                values,
                horizon=horizon,
            )

        return simple_average(
            values,
            horizon=horizon,
        )

    # ================================================================
    # OCCURRENCE LOOP
    # ================================================================

    def _occurrence_forecast_loop(
        self,
        values: np.ndarray,
        forecast: np.ndarray,
        occurrence_pct: float,
        classification: str,
        method: str,
    ) -> np.ndarray:

        forecast = np.asarray(
            forecast,
            dtype=float,
        )

        forecast = np.maximum(
            forecast,
            0.0,
        )

        if classification == "NO_DEMAND":
            return np.zeros(
                self.config.horizon
            )

        recent_window = min(
            6,
            len(values),
        )

        recent_values = (
            values[-recent_window:]
            if recent_window > 0
            else values
        )

        recent_occurrence = (
            np.count_nonzero(
                recent_values > 0
            )
            / len(recent_values)
            * 100.0
            if len(recent_values)
            else 0.0
        )

        # If the part historically occurs but has completely
        # disappeared recently, flagging is preferable to
        # artificially increasing the forecast.
        if (
            occurrence_pct > 0
            and recent_occurrence == 0
            and method in {
                "CROSTON_SBA",
                "TSB",
            }
        ):
            forecast *= 0.50

        # Extremely low historical occurrence should not generate
        # an aggressive quantity forecast.
        if occurrence_pct <= 10.0:
            forecast *= 0.50

        return np.maximum(
            forecast,
            0.0,
        )

    # ================================================================
    # TREND
    # ================================================================

    @staticmethod
    def _calculate_trend(
        values: np.ndarray,
    ) -> str:

        nonzero = values[values > 0]

        if len(nonzero) < 2:
            return "Insufficient History"

        split = max(
            1,
            len(nonzero) // 2,
        )

        first = float(
            np.mean(nonzero[:split])
        )

        second = float(
            np.mean(nonzero[-split:])
        )

        if first == 0:
            return "Stable"

        change = (
            second - first
        ) / first * 100.0

        if change > 15:
            return "Increasing"

        if change < -15:
            return "Decreasing"

        return "Stable"

    # ================================================================
    # CONFIDENCE
    # ================================================================

    @staticmethod
    def _calculate_confidence(
        values: np.ndarray,
        occurrence_pct: float,
        periods: int,
        method: str,
    ) -> str:

        if method == "NO_DEMAND":
            return "None"

        score = 0

        if periods >= 12:
            score += 2
        elif periods >= 6:
            score += 1

        if occurrence_pct >= 50:
            score += 2
        elif occurrence_pct >= 25:
            score += 1

        if method in {
            "CROSTON_SBA",
            "TSB",
        }:
            if occurrence_pct >= 25:
                score += 1

        if score >= 4:
            return "High"

        if score >= 2:
            return "Medium"

        return "Low"

    # ================================================================
    # PART DESCRIPTION
    # ================================================================

    @staticmethod
    def _get_part_desc(
        group: pd.DataFrame,
    ) -> str:

        if "part_desc" not in group.columns:
            return ""

        values = (
            group["part_desc"]
            .dropna()
            .astype(str)
            .str.strip()
        )

        if values.empty:
            return ""

        return values.iloc[0]

    # ================================================================
    # EMPTY OUTPUT
    # ================================================================

    def _empty_output(self) -> pd.DataFrame:

        columns = [
            "Project",
            "Part Code",
            "Part Desc",
            "Historical_Months",
            "Demand_Months",
            "Demand_Occurrence_%",
            "Total_Historical_Demand",
            "Average_Demand_When_Active",
            "ADI",
            "CV2",
            "Demand_Classification",
            "Forecast_Method",
            "Trend",
            "Confidence",
            "Forecast_Occurrence_Reference_%",
        ]

        columns.extend(
            [
                f"Forecast_M{i}"
                for i in range(
                    1,
                    self.config.horizon + 1,
                )
            ]
        )

        return pd.DataFrame(
            columns=columns
        )