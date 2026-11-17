from __future__ import annotations

from typing import Any

import pandas as pd

from app.core.database import fetch_df, fetch_all, fetch_one, list_columns, table_exists


class SciipRepository:
    def has_table(self, name: str) -> bool:
        return table_exists(name)

    def columns(self, name: str) -> list[str]:
        return list_columns(name)

    def query_df(self, query: str, params: tuple[Any, ...] = ()) -> pd.DataFrame:
        return fetch_df(query, params)

    def query_all(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return fetch_all(query, params)

    def query_one(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        return fetch_one(query, params)

