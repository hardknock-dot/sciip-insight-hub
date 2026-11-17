from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.ai.chatbot import SciipCopilot, get_copilot
from app.ai.tools import execute_tool
from app.core.config import get_settings
from app.services.sciip_repository import SciipRepository
from app.services.sciip_service import SciipService


@pytest.fixture(scope="module")
def service() -> SciipService:
    return SciipService(repo=SciipRepository())


def test_customer_search_returns_results(service: SciipService):
    results = service.search_customers("VTE")
    assert results
    assert any("VTE" in row["cust_name"] for row in results)


def test_customer_search_empty_result(service: SciipService):
    results = service.search_customers("NO_SUCH_CUSTOMER_SHOULD_EXIST")
    assert results == []


def test_customer_detail(service: SciipService):
    customer = service.get_customer("VTE KOREA Co.,Ltd.")
    assert customer is not None
    assert customer["profile"]["cust_name"] == "VTE KOREA Co.,Ltd."


def test_part_search_returns_results(service: SciipService):
    results = service.search_parts("720-092758-010")
    assert results["items"]
    assert any(row["part_code"] == "720-092758-010" for row in results["items"])


def test_part_detail(service: SciipService):
    part = service.get_part("ETCH", "720-092758-010")
    assert part is not None
    assert part["part"]["part_code"] == "720-092758-010"


def test_open_demand_customer_top(service: SciipService):
    top = service.top_customers(metric="open_qty", limit=5)
    assert len(top) == 5
    assert top[0]["currently_open_qty"] >= top[-1]["currently_open_qty"]


def test_open_demand_part_top(service: SciipService):
    top = service.top_parts(metric="open_qty", limit=5)
    assert len(top) == 5


def test_demand_trend(service: SciipService):
    trend = service.demand_summary(project="ETCH")
    assert trend["monthly"]


def test_forecast_retrieval(service: SciipService):
    forecast = service.forecast_summary(project="ETCH", part_code="720-092758-010")
    assert forecast["forecasts"] or forecast["accuracy"]


def test_demand_line_detail(service: SciipService):
    line = service.get_demand_line("1218-2004990-00-2.0-L1")
    assert line is not None
    assert line["line"]["line_id"] == "1218-2004990-00-2.0-L1"


def test_execute_tool_unknown():
    result = execute_tool("not_a_real_tool", {})
    assert result["ok"] is False
    assert "Unknown tool" in result["error"]


def test_copilot_fallback_without_ai_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_PROVIDER", "groq")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    get_settings.cache_clear()
    response = SciipCopilot().chat("What is our open demand?")
    assert response["ready"] is False
    assert "GROQ_API_KEY" in response["answer"] or "AI provider API key" in response["answer"]


def test_copilot_health_reports_missing_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_PROVIDER", "groq")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROQ_BASE_URL", raising=False)
    monkeypatch.delenv("GROQ_MODEL", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    monkeypatch.delenv("GROK_BASE_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_BASE_URL", raising=False)
    get_settings.cache_clear()
    health = SciipCopilot().health()
    assert health["ready"] is False
    assert health["configured"] is False
    assert health["status"] == "missing_api_key"


def test_ollama_is_the_default_provider(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("OLLAMA_BASE_URL", raising=False)
    monkeypatch.delenv("OLLAMA_MODEL", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    get_settings.cache_clear()

    health = SciipCopilot().health()

    assert health["provider"] == "ollama"
    assert health["model"] == "qwen2.5:7b"
    assert health["configured"] is True
    assert health["ready"] is True


def test_ollama_configuration_needs_no_api_key(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("GROK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    get_settings.cache_clear()

    health = SciipCopilot().health()

    assert health["configured"] is True
    assert health["status"] == "configured"
    assert health["provider"] == "ollama"
    assert health["model"] == "qwen2.5:7b"
    assert health["ready"] is True


def test_ollama_chat_uses_chat_completions_and_tools(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict[str, object]] = []

    class FakeCompletions:
        def create(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                tool_call = SimpleNamespace(
                    id="call_ollama_1",
                    function=SimpleNamespace(
                        name="get_open_demand",
                        arguments='{"scope":"customers","limit":1}',
                    ),
                )
                return SimpleNamespace(
                    choices=[SimpleNamespace(
                        message=SimpleNamespace(content=None, tool_calls=[tool_call])
                    )]
                )
            return SimpleNamespace(
                choices=[SimpleNamespace(
                    message=SimpleNamespace(
                        content="Top demand customer returned from SCIIP data.",
                        tool_calls=[],
                    )
                )]
            )

    class FakeClient:
        chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setenv("AI_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")
    get_settings.cache_clear()
    copilot = SciipCopilot()
    copilot._client = FakeClient()  # type: ignore[assignment]

    response = copilot.chat("Which customers have the highest open demand?")

    assert response["ready"] is True
    assert response["answer"] == "Top demand customer returned from SCIIP data."
    assert response["evidence"][0]["tool"] == "get_open_demand"
    assert response["sources"] == ["customer_profiles"]
    assert calls[0]["model"] == "qwen2.5:7b"
    assert calls[0]["tools"][0]["function"]["name"] == "get_dashboard_summary"
    assert any(message["role"] == "tool" for message in calls[1]["messages"])


def test_copilot_tool_calling_flow_uses_database(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict[str, object]] = []

    class FakeResponses:
        def create(self, **kwargs):
            calls.append(kwargs)
            if len(calls) == 1:
                return SimpleNamespace(
                    id="resp_1",
                    output=[
                        SimpleNamespace(
                            type="function_call",
                            name="get_open_demand",
                            arguments='{"scope":"customers","limit":1}',
                            call_id="call_1",
                        )
                    ],
                    output_text=None,
                )
            return SimpleNamespace(id="resp_2", output=[], output_text="Top demand customer returned from SCIIP data.")

    class FakeClient:
        responses = FakeResponses()

    monkeypatch.setenv("AI_PROVIDER", "groq")
    get_settings.cache_clear()
    copilot = SciipCopilot()
    copilot._client = FakeClient()  # type: ignore[assignment]
    copilot._configuration_status = "configured"
    copilot._configuration_message = "OpenAI provider is configured."

    response = copilot.chat("Which customers have the highest open demand?")

    assert response["ready"] is True
    assert response["answer"] == "Top demand customer returned from SCIIP data."
    assert response["evidence"]
    assert response["evidence"][0]["tool"] == "get_open_demand"
    assert response["evidence"][0]["result"]["ok"] is True
    assert response["evidence"][0]["result"]["result"]["items"]
    assert response["sources"] == ["customer_profiles"]
    assert response["related_entities"]
    assert calls[0]["tools"]
    assert calls[1]["input"]
    assert "previous_response_id" not in calls[1]
