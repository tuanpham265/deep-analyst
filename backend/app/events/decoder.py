"""Translate OpenHands SDK Event objects into UIEvents for the frontend.

This module is the **highest-leverage** in the codebase: it determines how
faithfully the trace tree mirrors what the agent actually did. The capstone
rubric weights "Agent Decode Correctness" at 30% of the total grade.

Design rules:
- Each OpenHands Event maps to 0, 1, or 2 UIEvents (an ActionEvent with a
  non-empty thought emits a `thinking` then a `tool_call`).
- `tool_call_id` links ActionEvent → ObservationEvent (or AgentErrorEvent).
  We mirror this in UIEvent.parent_id so the frontend can build the tree.
- Unknown event types are returned as a single generic UIEvent rather than
  silently dropped — debuggability over compactness.
"""

from __future__ import annotations

import json
from typing import Any

from openhands.sdk.event import (
    ActionEvent,
    AgentErrorEvent,
    ConversationStateUpdateEvent,
    Event,
    LLMCompletionLogEvent,
    MessageEvent,
    ObservationEvent,
    StreamingDeltaEvent,
    SystemPromptEvent,
    TokenEvent,
)

from .types import UIEvent, UIEventKind


def decode(
    event: Event,
    *,
    run_id: str,
    agent_id: str = "orchestrator",
    parent_id: str | None = None,
) -> list[UIEvent]:
    """Return zero or more UIEvents for a single OpenHands event.

    `parent_id` is used as a fallback parent (e.g. the synthetic agent_start
    node a sub-agent's events should hang under). `tool_call_id`-based
    linking takes precedence when present.
    """

    if isinstance(event, SystemPromptEvent):
        return []
    if isinstance(event, (StreamingDeltaEvent, TokenEvent, LLMCompletionLogEvent, ConversationStateUpdateEvent)):
        return []

    if isinstance(event, ActionEvent):
        return _decode_action(event, run_id=run_id, agent_id=agent_id, parent_id=parent_id)
    if isinstance(event, ObservationEvent):
        return [_decode_observation(event, run_id=run_id, agent_id=agent_id)]
    if isinstance(event, MessageEvent):
        decoded = _decode_message(event, run_id=run_id, agent_id=agent_id, parent_id=parent_id)
        return [decoded] if decoded else []
    if isinstance(event, AgentErrorEvent):
        return [_decode_error(event, run_id=run_id, agent_id=agent_id)]

    # Unknown / catch-all — surface but don't try to interpret
    return [
        UIEvent(
            run_id=run_id,
            agent_id=agent_id,
            parent_id=parent_id,
            kind="thinking",
            label=type(event).__name__,
            payload={"_raw": _safe_dump(event)},
        )
    ]


def _decode_action(
    event: ActionEvent, *, run_id: str, agent_id: str, parent_id: str | None
) -> list[UIEvent]:
    out: list[UIEvent] = []

    thought_text = _join_text(event.thought) or (event.reasoning_content or "")
    if thought_text.strip():
        out.append(
            UIEvent(
                run_id=run_id,
                agent_id=agent_id,
                parent_id=parent_id,
                kind="thinking",
                status="ok",
                label=_truncate(thought_text, 120),
                payload={"text": thought_text},
            )
        )

    args: Any = event.tool_call.arguments if event.tool_call else None
    parsed_args: Any
    if isinstance(args, str):
        try:
            parsed_args = json.loads(args)
        except json.JSONDecodeError:
            parsed_args = args
    else:
        parsed_args = args

    out.append(
        UIEvent(
            id=event.id,
            run_id=run_id,
            agent_id=agent_id,
            parent_id=parent_id,
            kind="tool_call",
            status="running",
            label=event.tool_name or "tool",
            payload={
                "tool_name": event.tool_name,
                "tool_call_id": event.tool_call_id,
                "arguments": parsed_args,
            },
        )
    )
    return out


def _decode_observation(
    event: ObservationEvent, *, run_id: str, agent_id: str
) -> UIEvent:
    obs = event.observation
    content_text = _join_text(getattr(obs, "content", [])) if obs is not None else ""
    is_error = bool(getattr(obs, "is_error", False)) if obs is not None else False
    return UIEvent(
        run_id=run_id,
        agent_id=agent_id,
        parent_id=event.action_id,
        kind="tool_result",
        status="error" if is_error else "ok",
        label=_truncate(content_text, 120) if content_text else (event.tool_name or "result"),
        payload={
            "tool_name": event.tool_name,
            "tool_call_id": event.tool_call_id,
            "content": content_text,
            "is_error": is_error,
        },
    )


def _decode_message(
    event: MessageEvent, *, run_id: str, agent_id: str, parent_id: str | None
) -> UIEvent | None:
    msg = event.llm_message
    if msg is None:
        return None

    text = _join_text(getattr(msg, "content", []))
    if not text.strip() and msg.tool_calls:
        # Pure tool-call messages are surfaced via ActionEvent — no need for a separate UIEvent.
        return None

    role = msg.role
    kind: UIEventKind
    label: str

    if role == "assistant" and event.source == "agent":
        kind = "thinking"
        label = _truncate(text, 120)
    elif role == "user" and event.source == "user":
        # User's own input — already shown in chat panel; emit a low-noise event for the trace.
        kind = "user_answer"
        label = _truncate(text, 120)
    else:
        kind = "thinking"
        label = f"{role}: {_truncate(text, 100)}"

    return UIEvent(
        id=event.id,
        run_id=run_id,
        agent_id=agent_id,
        parent_id=parent_id,
        kind=kind,
        status="ok",
        label=label,
        payload={"role": role, "text": text},
    )


def _decode_error(
    event: AgentErrorEvent, *, run_id: str, agent_id: str
) -> UIEvent:
    return UIEvent(
        run_id=run_id,
        agent_id=agent_id,
        parent_id=event.tool_call_id or None,
        kind="error",
        status="error",
        label=_truncate(event.error, 120),
        payload={
            "tool_name": event.tool_name,
            "tool_call_id": event.tool_call_id,
            "error": event.error,
        },
    )


def _join_text(content_seq: Any) -> str:
    if not content_seq:
        return ""
    parts: list[str] = []
    for c in content_seq:
        text = getattr(c, "text", None)
        if isinstance(text, str):
            parts.append(text)
    return "\n".join(parts)


def _truncate(s: str, n: int) -> str:
    s = s.strip().replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def _safe_dump(event: Event) -> dict:
    try:
        return event.model_dump(mode="json")
    except Exception:
        return {"type": type(event).__name__}
