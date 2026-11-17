from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable

import pandas as pd

from .config import get_settings


def db_path() -> Path:
    return get_settings().db_path


def db_exists() -> bool:
    return db_path().exists()


@contextmanager
def connect():
    conn = sqlite3.connect(db_path())
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def fetch_df(query: str, params: Iterable[Any] = ()) -> pd.DataFrame:
    if not db_exists():
        return pd.DataFrame()
    with connect() as conn:
        try:
            return pd.read_sql_query(query, conn, params=tuple(params))
        except Exception:
            return pd.DataFrame()


def fetch_all(query: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
    df = fetch_df(query, params)
    return df.to_dict(orient="records") if len(df) else []


def fetch_one(query: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
    rows = fetch_all(query, params)
    return rows[0] if rows else None


def table_exists(table_name: str) -> bool:
    if not db_exists():
        return False
    with connect() as conn:
        cursor = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1",
            (table_name,),
        )
        return cursor.fetchone() is not None


def list_tables() -> list[str]:
    if not db_exists():
        return []
    with connect() as conn:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    return [row["name"] for row in rows]


def list_columns(table_name: str) -> list[str]:
    if not table_exists(table_name):
        return []
    with connect() as conn:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return [row["name"] for row in rows]

