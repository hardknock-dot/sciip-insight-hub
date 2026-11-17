from __future__ import annotations

from typing import Any, Callable

from app.services.sciip_repository import SciipRepository
from app.services.sciip_service import SciipService


def _service() -> SciipService:
    return SciipService(repo=SciipRepository())


def get_tool_definitions() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "name": "get_dashboard_summary",
            "description": "Return SCIIP dashboard KPI and chart data.",
            "parameters": {"type": "object", "properties": {}, "additionalProperties": False},
        },
        {
            "type": "function",
            "name": "search_customers",
            "description": "Search customers by name.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}, "limit": {"type": "integer", "default": 20}},
                "required": ["query"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_customer",
            "description": "Get a customer profile and recent SCIIP activity.",
            "parameters": {
                "type": "object",
                "properties": {"customer_name": {"type": "string"}},
                "required": ["customer_name"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "search_parts",
            "description": "Search parts by code or description.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "project": {"type": "string"},
                    "limit": {"type": "integer", "default": 20},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_part",
            "description": "Get a part's intelligence, forecast, and history.",
            "parameters": {
                "type": "object",
                "properties": {"project": {"type": "string"}, "part_code": {"type": "string"}},
                "required": ["project", "part_code"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_open_demand",
            "description": "Return the customers or parts with the most open demand.",
            "parameters": {
                "type": "object",
                "properties": {
                    "scope": {"type": "string", "enum": ["customers", "parts"], "default": "customers"},
                    "limit": {"type": "integer", "default": 10},
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_demand_trend",
            "description": "Return a demand trend, optionally filtered by project, customer, or part.",
            "parameters": {
                "type": "object",
                "properties": {
                    "project": {"type": "string"},
                    "customer": {"type": "string"},
                    "part_code": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_demand_line",
            "description": "Get one reconstructed demand line and its timeline.",
            "parameters": {
                "type": "object",
                "properties": {"line_id": {"type": "string"}},
                "required": ["line_id"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "search_sales_orders",
            "description": "Search sales orders by order number, customer, or part.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}, "limit": {"type": "integer", "default": 20}},
                "required": ["query"],
                "additionalProperties": False,
            },
        },
        {
            "type": "function",
            "name": "get_forecast",
            "description": "Return forecast information for a project and part.",
            "parameters": {
                "type": "object",
                "properties": {"project": {"type": "string"}, "part_code": {"type": "string"}},
                "required": ["project", "part_code"],
                "additionalProperties": False,
            },
        },
    ]


def _callable_map() -> dict[str, Callable[..., Any]]:
    service = _service()
    return {
        "get_dashboard_summary": service.dashboard_summary,
        "search_customers": lambda query, limit=20: {"items": service.search_customers(query=query, limit=limit)},
        "get_customer": service.get_customer,
        "search_parts": lambda query, project=None, limit=20: service.search_parts(search=query, project=project, limit=limit),
        "get_part": service.get_part,
        "get_open_demand": lambda scope="customers", limit=10: {
            "items": service.top_customers(limit=limit) if scope == "customers" else service.top_parts(limit=limit)
        },
        "get_demand_trend": service.demand_summary,
        "get_demand_line": service.get_demand_line,
        "search_sales_orders": lambda query, limit=20: {"items": service.search_sales_orders(query=query, limit=limit)},
        "get_forecast": lambda project, part_code: service.forecast_summary(project=project, part_code=part_code),
    }


def execute_tool(name: str, arguments: dict[str, Any]) -> Any:
    mapping = _callable_map()
    if name not in mapping:
        return {"ok": False, "error": f"Unknown tool: {name}"}
    try:
        result = mapping[name](**arguments)
        return {"ok": True, "result": result}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

