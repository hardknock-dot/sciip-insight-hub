from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.core.database import fetch_all, fetch_df, fetch_one, table_exists
from app.services.sciip_repository import SciipRepository


def _nan_to_none(value: Any) -> Any:
    if pd.isna(value):
        return None
    return value


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    if df is None or len(df) == 0:
        return []
    clean = df.copy()
    clean = clean.where(pd.notna(clean), None)
    return clean.to_dict(orient="records")


def _parse_like(query: str) -> str:
    return f"%{query.strip()}%"


@dataclass
class SciipService:
    repo: SciipRepository

    def _has(self, table: str) -> bool:
        return self.repo.has_table(table)

    def _df(self, query: str, params: tuple[Any, ...] = ()) -> pd.DataFrame:
        return self.repo.query_df(query, params)

    def _one(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        return self.repo.query_one(query, params)

    def dashboard_summary(self) -> dict[str, Any]:
        demand = self._one(
            """
            SELECT
              COUNT(*) AS demand_lines,
              COUNT(DISTINCT so_no) AS sales_orders,
              COUNT(DISTINCT cust_name) AS customers,
              COUNT(DISTINCT part_code) AS parts,
              COALESCE(SUM(original_qty), 0) AS total_demand,
              COALESCE(SUM(open_qty), 0) AS open_demand,
              COALESCE(SUM(shipped_qty), 0) AS shipped_demand,
              COALESCE(SUM(order_amt), 0) AS revenue,
              COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS open_lines,
              COALESCE(AVG(CASE WHEN original_qty > 0 THEN shipped_qty * 1.0 / original_qty END), NULL) AS fulfillment_rate
            FROM demand_lines
            """
        ) or {}
        forecast = self._one(
            """
            SELECT COALESCE(SUM(forecast_next_3mo_qty), 0) AS forecasted_demand
            FROM part_forecasts
            """
        ) or {}
        freshness = self._one(
            """
            SELECT MAX(_computed_at) AS computed_at FROM demand_lines
            """
        ) or {}
        by_month = self._df(
            """
            SELECT month, SUM(qty) AS qty, SUM(order_lines) AS order_lines
            FROM part_monthly_demand
            GROUP BY month
            ORDER BY month
            """
        )
        top_customers = self._df(
            """
            SELECT cust_name, currently_open_qty, total_revenue, total_demand_lines
            FROM customer_profiles
            ORDER BY currently_open_qty DESC, total_revenue DESC
            LIMIT 10
            """
        )
        top_parts = self._df(
            """
            SELECT pis.project, pis.part_code, COALESCE(d.part_desc, '') AS part_desc,
                   pis.total_qty, pis.forecast_next_3mo_qty, pis.forecast_monthly_qty
            FROM part_intelligence_summary pis
            LEFT JOIN (
                SELECT project, part_code, MAX(part_desc) AS part_desc
                FROM demand_lines
                GROUP BY project, part_code
            ) d
            ON d.project = pis.project AND d.part_code = pis.part_code
            ORDER BY pis.forecast_next_3mo_qty DESC, pis.total_qty DESC
            LIMIT 10
            """
        )
        open_status = self._df(
            """
            SELECT status, COUNT(*) AS count, COALESCE(SUM(open_qty), 0) AS open_qty
            FROM demand_lines
            GROUP BY status
            """
        )
        return {
            "metrics": {
                "total_demand": demand.get("total_demand"),
                "open_demand": demand.get("open_demand"),
                "fulfillment_rate": demand.get("fulfillment_rate"),
                "customers": demand.get("customers"),
                "parts": demand.get("parts"),
                "sales_orders": demand.get("sales_orders"),
                "open_lines": demand.get("open_lines"),
                "revenue": demand.get("revenue"),
                "forecasted_demand": forecast.get("forecasted_demand"),
            },
            "freshness": freshness.get("computed_at"),
            "monthly_demand": _records(by_month),
            "top_customers": _records(top_customers),
            "top_parts": _records(top_parts),
            "open_status": _records(open_status),
        }

    def dashboard_charts(self) -> dict[str, Any]:
        monthly = self._df(
            """
            SELECT month, SUM(qty) AS qty, SUM(order_lines) AS order_lines
            FROM part_monthly_demand
            GROUP BY month
            ORDER BY month
            """
        )
        by_customer = self._df(
            """
            SELECT cust_name, currently_open_qty AS open_qty, total_revenue AS revenue,
                   total_demand_lines AS demand_lines
            FROM customer_profiles
            ORDER BY open_qty DESC
            LIMIT 10
            """
        )
        by_part = self._df(
            """
            SELECT project, part_code, total_qty, forecast_next_3mo_qty
            FROM part_intelligence_summary
            ORDER BY total_qty DESC
            LIMIT 10
            """
        )
        return {
            "monthly_demand": _records(monthly),
            "customer_demand": _records(by_customer),
            "part_demand": _records(by_part),
        }

    def list_customers(self, search: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        where = ""
        params: list[Any] = []
        if search:
            where = "WHERE cust_name LIKE ?"
            params.append(_parse_like(search))
        total = self._one(f"SELECT COUNT(*) AS count FROM customer_profiles {where}", tuple(params)) or {}
        df = self._df(
            f"""
            SELECT cust_name, total_demand_lines, distinct_parts, distinct_projects,
                   total_qty_ordered, total_revenue, avg_order_value,
                   first_order_date, last_order_date, recency_days, tenure_days,
                   avg_order_interval_days, currently_open_lines, currently_open_qty
            FROM customer_profiles
            {where}
            ORDER BY currently_open_qty DESC, total_revenue DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        )
        return {"total": total.get("count", 0), "items": _records(df)}

    def get_customer(self, customer_name: str) -> dict[str, Any] | None:
        profile = self._one("SELECT * FROM customer_profiles WHERE cust_name = ? LIMIT 1", (customer_name,))
        if not profile:
            return None
        yearly = self._df("SELECT * FROM customer_yearly_trend WHERE cust_name = ? ORDER BY project", (customer_name,))
        parts = self._df(
            """
            SELECT pcb.*, COALESCE(pis.demand_pattern, '') AS demand_pattern,
                   COALESCE(pis.forecast_monthly_qty, NULL) AS forecast_monthly_qty
            FROM part_customer_breakdown pcb
            LEFT JOIN part_intelligence_summary pis
              ON pis.project = pcb.project AND pis.part_code = pcb.part_code
            WHERE pcb.cust_name = ?
            ORDER BY pcb.cust_qty DESC
            """,
            (customer_name,),
        )
        recent = self._df(
            """
            SELECT line_id, so_no, so_date, project, part_code, part_desc,
                   original_qty, shipped_qty, open_qty, status, order_amt
            FROM demand_lines
            WHERE cust_name = ?
            ORDER BY so_date DESC
            LIMIT 25
            """,
            (customer_name,),
        )
        open_demand = self._one(
            """
            SELECT COALESCE(SUM(open_qty), 0) AS open_qty,
                   COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS open_lines
            FROM demand_lines
            WHERE cust_name = ?
            """,
            (customer_name,),
        ) or {}
        return {
            "profile": profile,
            "yearly_trend": _records(yearly),
            "parts": _records(parts),
            "recent_transactions": _records(recent),
            "open_demand": open_demand,
        }

    def search_parts(self, search: str | None = None, project: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
        where = []
        params: list[Any] = []
        if search:
            where.append("(pis.part_code LIKE ? OR COALESCE(d.part_desc, '') LIKE ?)")
            like = _parse_like(search)
            params.extend([like, like])
        if project:
            where.append("pis.project = ?")
            params.append(project)
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        total = self._one(
            f"""
            SELECT COUNT(*) AS count
            FROM part_intelligence_summary pis
            LEFT JOIN (
                SELECT project, part_code, MAX(part_desc) AS part_desc
                FROM demand_lines
                GROUP BY project, part_code
            ) d ON d.project = pis.project AND d.part_code = pis.part_code
            {clause}
            """,
            tuple(params),
        ) or {}
        df = self._df(
            f"""
            SELECT pis.project, pis.part_code, COALESCE(d.part_desc, '') AS part_desc,
                   pis.demand_pattern, pis.total_qty, pis.forecast_monthly_qty,
                   pis.forecast_next_3mo_qty, pis.top_customer,
                   pis.top_customer_pct_of_demand, pis.num_customers
            FROM part_intelligence_summary pis
            LEFT JOIN (
                SELECT project, part_code, MAX(part_desc) AS part_desc
                FROM demand_lines
                GROUP BY project, part_code
            ) d ON d.project = pis.project AND d.part_code = pis.part_code
            {clause}
            ORDER BY pis.forecast_next_3mo_qty DESC, pis.total_qty DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        )
        return {"total": total.get("count", 0), "items": _records(df)}

    def get_part(self, project: str, part_code: str) -> dict[str, Any] | None:
        part = self._one(
            """
            SELECT pis.*, COALESCE(d.part_desc, '') AS part_desc
            FROM part_intelligence_summary pis
            LEFT JOIN (
                SELECT project, part_code, MAX(part_desc) AS part_desc
                FROM demand_lines
                GROUP BY project, part_code
            ) d ON d.project = pis.project AND d.part_code = pis.part_code
            WHERE pis.project = ? AND pis.part_code = ?
            LIMIT 1
            """,
            (project, part_code),
        )
        if not part:
            return None
        monthly = self._df(
            """
            SELECT month, qty, order_lines
            FROM part_monthly_demand
            WHERE project = ? AND part_code = ?
            ORDER BY month
            """,
            (project, part_code),
        )
        yearly = self._df(
            """
            SELECT * FROM part_yearly_trend
            WHERE project = ? AND part_code = ?
            LIMIT 1
            """,
            (project, part_code),
        )
        breakdown = self._df(
            """
            SELECT * FROM part_customer_breakdown
            WHERE project = ? AND part_code = ?
            ORDER BY cust_qty DESC
            """,
            (project, part_code),
        )
        forecast = self._one(
            """
            SELECT * FROM part_forecasts
            WHERE project = ? AND part_code = ?
            LIMIT 1
            """,
            (project, part_code),
        )
        accuracy = self._one(
            """
            SELECT * FROM part_forecast_accuracy
            WHERE project = ? AND part_code = ?
            LIMIT 1
            """,
            (project, part_code),
        )
        recent = self._df(
            """
            SELECT line_id, so_no, so_date, cust_name, original_qty, shipped_qty, open_qty, status, order_amt
            FROM demand_lines
            WHERE project = ? AND part_code = ?
            ORDER BY so_date DESC
            LIMIT 25
            """,
            (project, part_code),
        )
        open_demand = self._one(
            """
            SELECT COALESCE(SUM(open_qty), 0) AS open_qty,
                   COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) AS open_lines
            FROM demand_lines
            WHERE project = ? AND part_code = ?
            """,
            (project, part_code),
        ) or {}
        return {
            "part": part,
            "monthly_demand": _records(monthly),
            "yearly_trend": _records(yearly),
            "customer_breakdown": _records(breakdown),
            "forecast": forecast,
            "accuracy": accuracy,
            "recent_transactions": _records(recent),
            "open_demand": open_demand,
        }

    def list_demand_lines(
        self,
        search: str | None = None,
        project: str | None = None,
        customer: str | None = None,
        part_code: str | None = None,
        status: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        limit: int = 50,
        offset: int = 0,
        sort_by: str = "so_date",
        sort_dir: str = "desc",
    ) -> dict[str, Any]:
        clauses = []
        params: list[Any] = []
        if search:
            like = _parse_like(search)
            clauses.append("(so_no LIKE ? OR cust_name LIKE ? OR part_code LIKE ? OR part_desc LIKE ?)")
            params.extend([like, like, like, like])
        if project:
            clauses.append("project = ?")
            params.append(project)
        if customer:
            clauses.append("cust_name = ?")
            params.append(customer)
        if part_code:
            clauses.append("part_code = ?")
            params.append(part_code)
        if status:
            clauses.append("status = ?")
            params.append(status)
        if date_from:
            clauses.append("date(so_date) >= date(?)")
            params.append(date_from)
        if date_to:
            clauses.append("date(so_date) <= date(?)")
            params.append(date_to)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        allowed_sort = {
            "so_date",
            "cust_name",
            "part_code",
            "project",
            "original_qty",
            "open_qty",
            "shipped_qty",
            "status",
            "order_amt",
        }
        sort_column = sort_by if sort_by in allowed_sort else "so_date"
        sort_direction = "ASC" if sort_dir.lower() == "asc" else "DESC"
        total = self._one(f"SELECT COUNT(*) AS count FROM demand_lines {where}", tuple(params)) or {}
        df = self._df(
            f"""
            SELECT line_id, so_no, so_date, cust_name, part_code, part_desc, project,
                   original_qty, shipped_qty, open_qty, status, num_shipments,
                   first_ship_date, last_ship_date, order_amt, needs_review,
                   committed_del_date, cus_requested_date
            FROM demand_lines
            {where}
            ORDER BY {sort_column} {sort_direction}
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        )
        return {"total": total.get("count", 0), "items": _records(df)}

    def get_demand_line(self, line_id: str) -> dict[str, Any] | None:
        line = self._one("SELECT * FROM demand_lines WHERE line_id = ? LIMIT 1", (line_id,))
        if not line:
            return None
        timeline = [
            {"label": "Sales order", "date": line.get("so_date")},
            {"label": "Customer requested", "date": line.get("cus_requested_date")},
            {"label": "Committed delivery", "date": line.get("committed_del_date")},
            {"label": "First shipment", "date": line.get("first_ship_date")},
            {"label": "Last shipment", "date": line.get("last_ship_date")},
        ]
        return {"line": line, "timeline": [step for step in timeline if step.get("date")]}

    def demand_summary(self, project: str | None = None, customer: str | None = None, part_code: str | None = None) -> dict[str, Any]:
        clauses = []
        params: list[Any] = []
        if project:
            clauses.append("project = ?")
            params.append(project)
        if customer:
            clauses.append("cust_name = ?")
            params.append(customer)
        if part_code:
            clauses.append("part_code = ?")
            params.append(part_code)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        monthly = self._df(
            f"""
            SELECT strftime('%Y-%m', so_date) AS month, SUM(original_qty) AS qty, SUM(open_qty) AS open_qty
            FROM demand_lines
            {where}
            GROUP BY strftime('%Y-%m', so_date)
            ORDER BY month
            """,
            tuple(params),
        )
        by_customer = self._df(
            f"""
            SELECT cust_name, SUM(original_qty) AS qty, SUM(open_qty) AS open_qty, SUM(order_amt) AS revenue
            FROM demand_lines
            {where}
            GROUP BY cust_name
            ORDER BY qty DESC
            LIMIT 10
            """,
            tuple(params),
        )
        by_part = self._df(
            f"""
            SELECT part_code, SUM(original_qty) AS qty, SUM(open_qty) AS open_qty
            FROM demand_lines
            {where}
            GROUP BY part_code
            ORDER BY qty DESC
            LIMIT 10
            """,
            tuple(params),
        )
        return {
            "monthly": _records(monthly),
            "by_customer": _records(by_customer),
            "by_part": _records(by_part),
        }

    def forecast_summary(self, project: str | None = None, part_code: str | None = None) -> dict[str, Any]:
        clauses = []
        params: list[Any] = []
        if project:
            clauses.append("project = ?")
            params.append(project)
        if part_code:
            clauses.append("part_code = ?")
            params.append(part_code)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        forecasts = self._df(
            f"""
            SELECT *
            FROM part_forecasts
            {where}
            ORDER BY forecast_next_3mo_qty DESC
            """,
            tuple(params),
        )
        accuracy = self._df(
            f"""
            SELECT *
            FROM part_forecast_accuracy
            {where}
            ORDER BY occurrence_hit_rate_pct DESC
            """,
            tuple(params),
        )
        return {"forecasts": _records(forecasts), "accuracy": _records(accuracy)}

    def top_customers(self, metric: str = "open_qty", limit: int = 10) -> list[dict[str, Any]]:
        metric_map = {
            "open_qty": "currently_open_qty",
            "revenue": "total_revenue",
            "demand": "total_qty_ordered",
            "lines": "total_demand_lines",
        }
        column = metric_map.get(metric, "currently_open_qty")
        df = self._df(
            f"""
            SELECT cust_name, currently_open_qty, total_revenue, total_qty_ordered, total_demand_lines
            FROM customer_profiles
            ORDER BY {column} DESC
            LIMIT ?
            """,
            (limit,),
        )
        return _records(df)

    def top_parts(self, metric: str = "open_qty", limit: int = 10) -> list[dict[str, Any]]:
        metric_map = {
            "open_qty": "open_qty",
            "forecast": "forecast_next_3mo_qty",
            "demand": "total_qty",
        }
        column = metric_map.get(metric, "open_qty")
        if metric == "open_qty":
            df = self._df(
                """
                SELECT project, part_code, SUM(open_qty) AS open_qty, SUM(original_qty) AS demand_qty
                FROM demand_lines
                GROUP BY project, part_code
                ORDER BY open_qty DESC
                LIMIT ?
                """,
                (limit,),
            )
        else:
            df = self._df(
                f"""
                SELECT project, part_code, total_qty, forecast_next_3mo_qty
                FROM part_intelligence_summary
                ORDER BY {column} DESC
                LIMIT ?
                """,
                (limit,),
            )
        return _records(df)

    def search_customers(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        return self.list_customers(search=query, limit=limit)["items"]

    def search_sales_orders(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        like = _parse_like(query)
        df = self._df(
            """
            SELECT DISTINCT so_no, cust_name, so_date, project, COUNT(*) AS lines,
                   SUM(original_qty) AS qty, SUM(open_qty) AS open_qty
            FROM demand_lines
            WHERE so_no LIKE ? OR cust_name LIKE ? OR part_code LIKE ?
            GROUP BY so_no, cust_name, so_date, project
            ORDER BY so_date DESC
            LIMIT ?
            """,
            (like, like, like, limit),
        )
        return _records(df)

    def search_parts_only(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        return self.search_parts(search=query, limit=limit)["items"]

