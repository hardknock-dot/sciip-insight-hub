from __future__ import annotations

import math
from typing import Iterable

import numpy as np


def _clean_series(values: Iterable[float]) -> np.ndarray:
    arr = np.asarray(list(values), dtype=float)

    if arr.size == 0:
        return np.array([], dtype=float)

    arr = np.nan_to_num(arr, nan=0.0, posinf=0.0, neginf=0.0)
    arr[arr < 0] = 0.0

    return arr


def simple_average(values: Iterable[float], horizon: int) -> np.ndarray:
    arr = _clean_series(values)

    if horizon <= 0:
        return np.array([], dtype=float)

    if arr.size == 0:
        return np.zeros(horizon)

    return np.repeat(float(np.mean(arr)), horizon)


def exponential_smoothing(
    values: Iterable[float],
    horizon: int,
    alpha: float = 0.30,
) -> np.ndarray:
    arr = _clean_series(values)

    if horizon <= 0:
        return np.array([], dtype=float)

    if arr.size == 0:
        return np.zeros(horizon)

    alpha = min(max(alpha, 0.01), 1.0)

    level = float(arr[0])

    for value in arr[1:]:
        level = alpha * float(value) + (1.0 - alpha) * level

    return np.repeat(max(level, 0.0), horizon)


def croston_sba(
    values: Iterable[float],
    horizon: int,
    alpha: float = 0.10,
) -> np.ndarray:
    """
    Syntetos-Boylan Approximation.

    Designed for intermittent demand.

    Returns a constant forecast over the requested horizon.
    """

    arr = _clean_series(values)

    if horizon <= 0:
        return np.array([], dtype=float)

    nonzero_positions = np.flatnonzero(arr > 0)

    if len(nonzero_positions) == 0:
        return np.zeros(horizon)

    first_position = int(nonzero_positions[0])

    demand_estimate = float(arr[first_position])
    interval_estimate = float(first_position + 1)

    last_position = first_position
    initialized = False

    for position in nonzero_positions[1:]:
        position = int(position)

        demand = float(arr[position])
        interval = float(position - last_position)

        if not initialized:
            demand_estimate = demand
            interval_estimate = interval
            initialized = True
        else:
            demand_estimate = (
                alpha * demand
                + (1.0 - alpha) * demand_estimate
            )

            interval_estimate = (
                alpha * interval
                + (1.0 - alpha) * interval_estimate
            )

        last_position = position

    if interval_estimate <= 0:
        return np.zeros(horizon)

    croston_forecast = demand_estimate / interval_estimate

    # SBA correction.
    sba_forecast = (1.0 - alpha / 2.0) * croston_forecast

    return np.repeat(max(sba_forecast, 0.0), horizon)


def tsb(
    values: Iterable[float],
    horizon: int,
    alpha_demand: float = 0.10,
    alpha_probability: float = 0.10,
) -> np.ndarray:
    """
    Teunter-Syntetos-Babai method.

    Useful where demand occurrence itself changes over time.
    """

    arr = _clean_series(values)

    if horizon <= 0:
        return np.array([], dtype=float)

    if arr.size == 0:
        return np.zeros(horizon)

    first_nonzero = np.flatnonzero(arr > 0)

    if len(first_nonzero) == 0:
        return np.zeros(horizon)

    probability = 1.0 if arr[0] > 0 else 0.0
    demand_size = float(arr[first_nonzero[0]])

    for value in arr:
        occurrence = 1.0 if value > 0 else 0.0

        probability = (
            alpha_probability * occurrence
            + (1.0 - alpha_probability) * probability
        )

        if value > 0:
            demand_size = (
                alpha_demand * float(value)
                + (1.0 - alpha_demand) * demand_size
            )

    forecast = probability * demand_size

    return np.repeat(max(forecast, 0.0), horizon)


def linear_trend_forecast(
    values: Iterable[float],
    horizon: int,
) -> np.ndarray:
    arr = _clean_series(values)

    if horizon <= 0:
        return np.array([], dtype=float)

    if arr.size < 2:
        return simple_average(arr, horizon)

    x = np.arange(len(arr), dtype=float)

    try:
        slope, intercept = np.polyfit(x, arr, 1)

        future_x = np.arange(
            len(arr),
            len(arr) + horizon,
            dtype=float,
        )

        forecast = intercept + slope * future_x

        return np.maximum(forecast, 0.0)

    except (ValueError, TypeError, np.linalg.LinAlgError):
        return simple_average(arr, horizon)