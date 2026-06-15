"""ask_user tool — lets the agent pause and request clarification from the
human via the chat UI. Blocks the agent thread on AskUserBroker until POST
/api/runs/{id}/answer fires.
"""

from __future__ import annotations

import contextvars
from collections.abc import Sequence
from typing import TYPE_CHECKING, Self

from pydantic import Field

from openhands.sdk.llm.message import TextContent
from openhands.sdk.tool.tool import (
    Action,
    Observation,
    ToolAnnotations,
    ToolDefinition,
    ToolExecutor,
)

from app.events import UIEvent
from app.runtime.ask_user import broker

if TYPE_CHECKING:
    from openhands.sdk.conversation.state import ConversationState


# Context var so the tool executor (which has no run_id field) can know which
# run/bus/agent to attach the synthetic ask_user UIEvent to.
current_run_ctx: contextvars.ContextVar[dict] = contextvars.ContextVar(
    "ask_user_run_ctx", default={}
)


class AskUserAction(Action):
    """Ask the human user a clarifying question and wait for their answer."""

    question: str = Field(description="The clarifying question to ask the user.")


class AskUserObservation(Observation):
    """The user's answer to the question."""

    pass


ASK_USER_DESCRIPTION = """Ask the human user a clarifying question and wait for
their answer. Use ONLY when you genuinely cannot proceed without more
information from the user (e.g. ambiguous scope, missing constraint). Do not
use for trivial confirmations; prefer proceeding with a reasonable default.

The agent will pause until the user responds via the UI. Then the user's
answer is returned as the observation.
"""


class AskUserExecutor(ToolExecutor):
    def __call__(
        self,
        action: AskUserAction,
        conversation=None,  # noqa: ARG002
    ) -> AskUserObservation:
        ctx = current_run_ctx.get()
        run_id = ctx.get("run_id")
        bus = ctx.get("bus")
        agent_id = ctx.get("agent_id", "orchestrator")
        parent_id = ctx.get("parent_id")

        if bus is not None and run_id:
            bus.push_threadsafe(
                UIEvent(
                    run_id=run_id,
                    agent_id=agent_id,
                    parent_id=parent_id,
                    kind="ask_user",
                    status="running",
                    label=action.question[:120],
                    payload={"question": action.question},
                )
            )

        if not run_id:
            return AskUserObservation(
                content=[TextContent(text="(no run context; ask_user is a no-op)")],
                is_error=True,
            )

        try:
            answer = broker.wait_for_answer(run_id)
        except TimeoutError as e:
            if bus is not None:
                bus.push_threadsafe(
                    UIEvent(
                        run_id=run_id,
                        agent_id=agent_id,
                        parent_id=parent_id,
                        kind="error",
                        status="error",
                        label=str(e),
                        payload={"source": "ask_user"},
                    )
                )
            return AskUserObservation(
                content=[TextContent(text=f"ask_user timed out: {e}")], is_error=True
            )

        if bus is not None:
            bus.push_threadsafe(
                UIEvent(
                    run_id=run_id,
                    agent_id=agent_id,
                    parent_id=parent_id,
                    kind="user_answer",
                    status="ok",
                    label=answer[:120],
                    payload={"answer": answer},
                )
            )
        return AskUserObservation(content=[TextContent(text=answer)])


class AskUserTool(ToolDefinition[AskUserAction, AskUserObservation]):
    @classmethod
    def create(
        cls,
        conv_state: "ConversationState | None" = None,  # noqa: ARG003
        **params,
    ) -> Sequence[Self]:
        if params:
            raise ValueError("AskUserTool doesn't accept parameters")
        return [
            cls(
                description=ASK_USER_DESCRIPTION,
                action_type=AskUserAction,
                observation_type=AskUserObservation,
                executor=AskUserExecutor(),
                annotations=ToolAnnotations(
                    readOnlyHint=True,
                    destructiveHint=False,
                    idempotentHint=False,
                    openWorldHint=False,
                ),
            )
        ]
