from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.ai.chatbot import get_copilot
from app.core.database import list_tables
from app.services.sciip_repository import SciipRepository
from app.services.sciip_service import SciipService


repo = SciipRepository()
service = SciipService(repo=repo)
copilot = get_copilot()

api_router = APIRouter(prefix="/api")


class CopilotChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    conversation_id: str | None = None


class CopilotChatResponse(BaseModel):
    answer: str
    evidence: list[dict[str, Any]]
    sources: list[str]
    related_entities: list[dict[str, Any]]
    conversation_id: str
    ready: bool
    status: str | None = None


@api_router.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "database_ready": repo.has_table("demand_lines"),
        "tables": list_tables(),
    }


@api_router.get("/dashboard")
def dashboard() -> dict[str, Any]:
    return {"summary": service.dashboard_summary(), "charts": service.dashboard_charts()}


@api_router.get("/customers")
def customers(search: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    return service.list_customers(search=search, limit=limit, offset=offset)


@api_router.get("/customers/{customer_name:path}")
def customer_detail(customer_name: str) -> dict[str, Any]:
    result = service.get_customer(customer_name)
    if not result:
        raise HTTPException(status_code=404, detail="Customer not found")
    return result


@api_router.get("/parts")
def parts(search: str | None = None, project: str | None = None, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    return service.search_parts(search=search, project=project, limit=limit, offset=offset)


@api_router.get("/parts/{project}/{part_code}")
def part_detail(project: str, part_code: str) -> dict[str, Any]:
    result = service.get_part(project, part_code)
    if not result:
        raise HTTPException(status_code=404, detail="Part not found")
    return result


@api_router.get("/transactions/demand-lines")
def demand_lines(
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
    return service.list_demand_lines(
        search=search,
        project=project,
        customer=customer,
        part_code=part_code,
        status=status,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
        offset=offset,
        sort_by=sort_by,
        sort_dir=sort_dir,
    )


@api_router.get("/transactions/demand-lines/{line_id:path}")
def demand_line_detail(line_id: str) -> dict[str, Any]:
    result = service.get_demand_line(line_id)
    if not result:
        raise HTTPException(status_code=404, detail="Demand line not found")
    return result


@api_router.get("/demand")
def demand_summary(project: str | None = None, customer: str | None = None, part_code: str | None = None) -> dict[str, Any]:
    return service.demand_summary(project=project, customer=customer, part_code=part_code)


@api_router.get("/forecast")
def forecast_summary(project: str | None = None, part_code: str | None = None) -> dict[str, Any]:
    return service.forecast_summary(project=project, part_code=part_code)


@api_router.get("/copilot/health")
def copilot_health() -> dict[str, Any]:
    return copilot.health()


@api_router.post("/copilot/chat", response_model=CopilotChatResponse)
def copilot_chat(payload: CopilotChatRequest) -> dict[str, Any]:
    return copilot.chat(payload.message, payload.conversation_id)
