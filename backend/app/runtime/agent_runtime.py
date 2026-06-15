"""Generic helper that drives a single OpenHands Conversation as a sub-agent
inside a larger pipeline.

Decode hop:
  OpenHands Event → decoder.decode() → list[UIEvent] → bus.push_threadsafe()

`run_subagent` is synchronous and meant to be called via asyncio.to_thread
from the orchestrator. The callback fires on the agent's own thread and uses
``bus.push_threadsafe`` to hop back onto the FastAPI event loop.
"""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from openhands.sdk import Agent, Conversation
from openhands.sdk.event import Event, MessageEvent
from openhands.sdk.llm.message import Message, TextContent

from app.events import RunEventBus, UIEvent, decode

logger = logging.getLogger(__name__)


def _final_text(messages: list[MessageEvent]) -> str:
    """Pluck the final assistant text from the captured MessageEvents."""
    for ev in reversed(messages):
        msg = ev.llm_message
        if msg is None or msg.role != "assistant":
            continue
        for c in msg.content or []:
            text = getattr(c, "text", None)
            if isinstance(text, str) and text.strip():
                return text
    return ""


def run_subagent(
    *,
    run_id: str,
    agent_id: str,
    bus: RunEventBus,
    agent: Agent,
    prompt: str,
    parent_id: str | None = None,
    workspace: str | None = None,
    max_iterations: int = 5,
) -> str:
    """Run one OpenHands Conversation to completion and return the final
    assistant message text. Forwards every Event to the run's bus as UIEvents.
    """

    captured_messages: list[MessageEvent] = []

    def on_event(event: Event) -> None:
        try:
            if isinstance(event, MessageEvent):
                captured_messages.append(event)
            for ui in decode(
                event, run_id=run_id, agent_id=agent_id, parent_id=parent_id
            ):
                bus.push_threadsafe(ui)
        except Exception:  # pragma: no cover — never let a callback crash the loop
            logger.exception("decoder/forwarder crashed; dropping event")

    ws_path = Path(workspace) if workspace else Path(tempfile.mkdtemp(prefix=f"run_{run_id[:8]}_{agent_id}_"))
    ws_path.mkdir(parents=True, exist_ok=True)

    bus.push_threadsafe(
        UIEvent(
            run_id=run_id,
            agent_id=agent_id,
            parent_id=parent_id,
            kind="agent_start",
            status="running",
            label=agent_id,
            payload={"prompt": prompt[:500]},
        )
    )

    try:
        conversation = Conversation(
            agent=agent,
            workspace=str(ws_path),
            callbacks=[on_event],
            visualizer=None,  # we render in the UI, no need for OpenHands' Rich output
            max_iteration_per_run=max_iterations,
            stuck_detection=True,
        )
        conversation.send_message(prompt)
        conversation.run()
    except Exception as e:
        bus.push_threadsafe(
            UIEvent(
                run_id=run_id,
                agent_id=agent_id,
                parent_id=parent_id,
                kind="error",
                status="error",
                label=f"{type(e).__name__}: {e}"[:200],
                payload={"error": str(e), "exception_type": type(e).__name__},
            )
        )
        raise

    final = _final_text(captured_messages)

    bus.push_threadsafe(
        UIEvent(
            run_id=run_id,
            agent_id=agent_id,
            parent_id=parent_id,
            kind="agent_finish",
            status="ok",
            label=f"{agent_id} done",
            payload={"final_text_preview": final[:300]},
        )
    )
    return final
