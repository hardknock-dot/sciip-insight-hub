from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

try:
    from openai import AuthenticationError, OpenAI
except Exception:  # pragma: no cover - optional during local dev/test bootstrap
    AuthenticationError = None  # type: ignore[assignment]
    OpenAI = None  # type: ignore[assignment]

from app.ai.prompts import SYSTEM_PROMPT
from app.ai.tools import execute_tool, get_tool_definitions
from app.core.config import get_settings


@dataclass
class ConversationState:
    last_response_id: str | None = None
    turns: int = 0
    history: list[dict[str, Any]] = field(default_factory=list)


class CopilotError(RuntimeError):
    pass


class SciipCopilot:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._configuration_status, self._configuration_message = self.settings.ai_configuration_status()
        if self._configuration_status == "configured" and OpenAI:
            client_kwargs: dict[str, Any] = {"api_key": self.settings.openai_api_key}
            if self.settings.openai_base_url:
                client_kwargs["base_url"] = self.settings.openai_base_url
            self._client = OpenAI(**client_kwargs)
        else:
            self._client = None
        self._conversations: dict[str, ConversationState] = {}

    def health(self) -> dict[str, Any]:
        return {
            "ready": self._client is not None,
            "configured": self._configuration_status == "configured",
            "status": self._configuration_status,
            "message": self._configuration_message,
            "provider": self.settings.ai_provider,
            "model": self.settings.openai_model,
            "conversations": len(self._conversations),
        }

    def _state(self, conversation_id: str | None) -> tuple[str, ConversationState]:
        key = conversation_id or "default"
        state = self._conversations.setdefault(key, ConversationState())
        return key, state

    def chat(self, message: str, conversation_id: str | None = None) -> dict[str, Any]:
        if not self._client:
            if self._configuration_status != "configured":
                answer = self._configuration_message
            elif self.settings.ai_provider == "ollama":
                answer = "Ollama client is unavailable. Install the backend requirements and restart the API."
            else:
                answer = "SCIIP Copilot is not configured correctly. Please check the AI provider API key."
            return {
                "answer": answer,
                "evidence": [],
                "sources": [],
                "related_entities": [],
                "conversation_id": conversation_id or "default",
                "ready": False,
            }

        key, state = self._state(conversation_id)
        state.turns += 1
        state.history.append({"role": "user", "content": message})

        if self.settings.ai_provider == "ollama":
            return self._chat_ollama(key, state)

        create_kwargs: dict[str, Any] = {
            "model": self.settings.openai_model,
            "instructions": SYSTEM_PROMPT,
            "input": message,
            "tools": get_tool_definitions(),
        }
        if state.last_response_id and self.settings.ai_provider != "groq":
            create_kwargs["previous_response_id"] = state.last_response_id
        elif self.settings.ai_provider == "groq":
            create_kwargs["input"] = [
                {"role": item["role"], "content": item["content"]}
                for item in state.history
            ]
        try:
            response = self._client.responses.create(**create_kwargs)
        except Exception as exc:
            self._configuration_status = "error"
            self._configuration_message = str(exc)
            return {
                "answer": "SCIIP Copilot is not configured correctly. Please check the AI provider configuration.",
                "evidence": [],
                "sources": [],
                "related_entities": [],
                "conversation_id": key,
                "ready": False,
                "status": "error",
            }

        evidence: list[dict[str, Any]] = []
        related: list[dict[str, Any]] = []
        sources: list[str] = []
        loop_guard = 0

        while True:
            loop_guard += 1
            if loop_guard > self.settings.max_copilot_turns:
                raise CopilotError("Copilot tool loop exceeded the safety limit.")

            function_calls = [
                item for item in getattr(response, "output", [])
                if getattr(item, "type", "") in {"function_call", "tool_call"}
            ]
            if not function_calls:
                break

            outputs = []
            for call in function_calls:
                raw_args = getattr(call, "arguments", "{}") or "{}"
                try:
                    args = json.loads(raw_args)
                except Exception:
                    args = {}
                tool_name = getattr(call, "name", None) or getattr(call, "tool_name", None)
                tool_result = execute_tool(tool_name, args)
                self._record_tool_result(tool_name, args, tool_result, evidence, related, sources)
                outputs.append({
                    "type": "function_call_output",
                    "call_id": getattr(call, "call_id", None),
                    "output": json.dumps(tool_result),
                })

            try:
                followup_kwargs: dict[str, Any] = {
                    "model": self.settings.openai_model,
                    "instructions": SYSTEM_PROMPT,
                    "tools": get_tool_definitions(),
                }
                if self.settings.ai_provider == "groq":
                    # Groq does not support OpenAI's stateful response IDs.
                    followup_kwargs["input"] = [
                        {"role": "user", "content": message},
                        *[
                            {
                                "type": "function_call",
                                "name": getattr(call, "name", None) or getattr(call, "tool_name", None),
                                "arguments": getattr(call, "arguments", "{}") or "{}",
                                "call_id": getattr(call, "call_id", None),
                            }
                            for call in function_calls
                        ],
                        *outputs,
                    ]
                else:
                    followup_kwargs["input"] = outputs
                    followup_kwargs["previous_response_id"] = response.id
                response = self._client.responses.create(**followup_kwargs)
            except Exception as exc:
                self._configuration_status = "error"
                self._configuration_message = str(exc)
                return {
                    "answer": "SCIIP Copilot is not configured correctly. Please check the AI provider configuration.",
                    "evidence": evidence,
                    "sources": list(dict.fromkeys(sources)),
                    "related_entities": self._dedupe_related(related),
                    "conversation_id": key,
                    "ready": False,
                    "status": "error",
                }

        answer = getattr(response, "output_text", None) or "No answer was generated."
        state.last_response_id = response.id
        state.history.append({"role": "assistant", "content": answer})
        related = self._dedupe_related(related)
        sources = list(dict.fromkeys(sources))
        return {
            "answer": answer,
            "evidence": evidence,
            "sources": sources,
            "related_entities": related,
            "conversation_id": key,
            "ready": True,
        }

    def _chat_ollama(self, key: str, state: ConversationState) -> dict[str, Any]:
        evidence: list[dict[str, Any]] = []
        related: list[dict[str, Any]] = []
        sources: list[str] = []
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, *state.history]
        tools = [
            {"type": "function", "function": {key: value for key, value in tool.items() if key != "type"}}
            for tool in get_tool_definitions()
        ]

        try:
            for _ in range(self.settings.max_copilot_turns):
                response = self._client.chat.completions.create(
                    model=self.settings.openai_model,
                    messages=messages,
                    tools=tools,
                )
                choice = response.choices[0]
                assistant_message = choice.message
                tool_calls = getattr(assistant_message, "tool_calls", None) or []
                if not tool_calls:
                    answer = getattr(assistant_message, "content", None) or "No answer was generated."
                    state.history.append({"role": "assistant", "content": answer})
                    return {
                        "answer": answer,
                        "evidence": evidence,
                        "sources": list(dict.fromkeys(sources)),
                        "related_entities": self._dedupe_related(related),
                        "conversation_id": key,
                        "ready": True,
                    }

                messages.append({
                    "role": "assistant",
                    "content": getattr(assistant_message, "content", None),
                    "tool_calls": [
                        {
                            "id": call.id,
                            "type": "function",
                            "function": {
                                "name": call.function.name,
                                "arguments": call.function.arguments,
                            },
                        }
                        for call in tool_calls
                    ],
                })
                for call in tool_calls:
                    try:
                        args = json.loads(call.function.arguments or "{}")
                    except (TypeError, json.JSONDecodeError):
                        args = {}
                    tool_result = execute_tool(call.function.name, args)
                    self._record_tool_result(
                        call.function.name, args, tool_result, evidence, related, sources
                    )
                    messages.append({
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(tool_result),
                    })
                state.history = messages[1:]
        except Exception as exc:
            self._configuration_status = "error"
            self._configuration_message = str(exc)
            return {
                "answer": (
                    "Could not reach the configured Ollama model. Check that Ollama is running, "
                    "the model is available, and OLLAMA_BASE_URL is correct."
                ),
                "evidence": evidence,
                "sources": list(dict.fromkeys(sources)),
                "related_entities": self._dedupe_related(related),
                "conversation_id": key,
                "ready": False,
                "status": "error",
            }

        raise CopilotError("Copilot tool loop exceeded the safety limit.")

    def _record_tool_result(
        self,
        tool_name: str | None,
        args: dict[str, Any],
        tool_result: dict[str, Any],
        evidence: list[dict[str, Any]],
        related: list[dict[str, Any]],
        sources: list[str],
    ) -> None:
        evidence.append({"tool": tool_name, "arguments": args, "result": tool_result})
        if not tool_result.get("ok"):
            return
        payload = tool_result["result"]
        if not isinstance(payload, dict):
            return
        if "profile" in payload:
            related.append({"type": "customer", "id": payload["profile"].get("cust_name")})
        if "part" in payload:
            related.append({
                "type": "part",
                "id": payload["part"].get("part_code"),
                "project": payload["part"].get("project"),
            })
        if "line" in payload:
            related.append({"type": "demand_line", "id": payload["line"].get("line_id")})
        if "items" in payload:
            for item in payload["items"][:5]:
                if not isinstance(item, dict):
                    continue
                if "cust_name" in item:
                    related.append({"type": "customer", "id": item.get("cust_name")})
                if "part_code" in item:
                    related.append({
                        "type": "part",
                        "id": item.get("part_code"),
                        "project": item.get("project"),
                    })
        sources.extend(self._extract_sources(payload))

    def _extract_sources(self, payload: Any) -> list[str]:
        sources: list[str] = []
        if isinstance(payload, dict):
            if "profile" in payload:
                sources.append("customer_profiles")
            if "part" in payload:
                sources.extend(["part_intelligence_summary", "part_forecasts", "part_customer_breakdown"])
            if "line" in payload:
                sources.append("demand_lines")
            if "monthly" in payload or "by_customer" in payload or "by_part" in payload:
                sources.append("demand_lines")
                sources.append("part_monthly_demand")
            if "items" in payload and isinstance(payload["items"], list):
                sample_items = [item for item in payload["items"] if isinstance(item, dict)][:5]
                if any("cust_name" in item for item in sample_items):
                    sources.append("customer_profiles")
                if any("part_code" in item for item in sample_items):
                    sources.extend(["part_intelligence_summary", "part_forecasts", "part_customer_breakdown"])
                if any("line_id" in item for item in sample_items):
                    sources.append("demand_lines")
        return sources

    def _dedupe_related(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        seen: set[tuple[Any, ...]] = set()
        result: list[dict[str, Any]] = []
        for item in items:
            key = tuple(sorted(item.items()))
            if key in seen:
                continue
            seen.add(key)
            result.append(item)
        return result


_copilot = SciipCopilot()


def get_copilot() -> SciipCopilot:
    return _copilot
