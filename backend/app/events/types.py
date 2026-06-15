from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

UIEventKind = Literal[
    "run_start",
    "agent_start",
    "thinking",
    "tool_call",
    "tool_result",
    "subagent_spawn",
    "subagent_finish",
    "ask_user",
    "user_answer",
    "artifact",
    "agent_finish",
    "run_finish",
    "error",
]

UIEventStatus = Literal["pending", "running", "ok", "error"]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class UIEvent(BaseModel):
    """Event sent over WebSocket to the frontend trace tree.

    Built by `events.decoder` from OpenHands SDK Event objects, or emitted
    directly by the runtime (e.g. run_start, ask_user, user_answer, error).
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    run_id: str
    ts: str = Field(default_factory=_now_iso)
    parent_id: str | None = None
    agent_id: str = "orchestrator"
    kind: UIEventKind
    status: UIEventStatus | None = None
    label: str = ""
    payload: dict[str, Any] = Field(default_factory=dict)
