import asyncio
import logging
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.artifacts import artifacts
from app.config import get_settings
from app.events import UIEvent, registry
from app.runtime import broker, run_research

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/runs", tags=["runs"])


class StartRunRequest(BaseModel):
    question: str


class StartRunResponse(BaseModel):
    run_id: str
    mode: str  # "real" or "demo"


@router.post("", response_model=StartRunResponse)
async def start_run(
    req: StartRunRequest,
    demo: bool = Query(False, description="Emit hardcoded fake trace instead of calling the LLM."),
) -> StartRunResponse:
    run_id = str(uuid4())
    bus = registry.create(run_id)
    settings = get_settings()
    mode = "demo" if (demo or not settings.opencode_zen_api_key) else "real"

    if mode == "demo":
        task = asyncio.create_task(_run_with_cleanup(_emit_fake_trace(run_id, req.question), run_id))
    else:
        task = asyncio.create_task(
            _run_with_cleanup(
                run_research(question=req.question, run_id=run_id, bus=bus, settings=settings),
                run_id,
            )
        )

    bus.task = task
    return StartRunResponse(run_id=run_id, mode=mode)


@router.post("/{run_id}/cancel")
async def cancel_run(run_id: str) -> dict:
    """Cancel a running orchestrator task. Caveat: this stops the asyncio
    task driving the orchestrator, but Python can't kill threads, so any
    OpenHands Conversation already in flight will finish on its own — we
    just stop forwarding its events to the user."""
    bus = registry.get(run_id)
    if bus is None:
        raise HTTPException(status_code=404, detail="run not found")
    cancelled = False
    if bus.task is not None and not bus.task.done():
        bus.task.cancel()
        cancelled = True
    # Wake any ask_user waiter so the agent thread can unwind.
    broker.cancel(run_id)
    bus.push(
        UIEvent(
            run_id=run_id,
            agent_id="orchestrator",
            kind="run_finish",
            status="error",
            label="cancelled by user",
        )
    )
    return {"ok": True, "cancelled": cancelled}


async def _run_with_cleanup(coro, run_id: str) -> None:
    try:
        await coro
    except asyncio.CancelledError:
        # `cancel_run` already pushed a run_finish event; just unwind quietly.
        raise
    except Exception as e:  # pragma: no cover — defensive
        logger.exception("run %s crashed", run_id)
        bus = registry.get(run_id)
        if bus is not None:
            bus.push(
                UIEvent(
                    run_id=run_id,
                    agent_id="orchestrator",
                    kind="error",
                    status="error",
                    label=f"{type(e).__name__}: {e}"[:200],
                    payload={"error": str(e)},
                )
            )
            bus.push(
                UIEvent(
                    run_id=run_id, agent_id="orchestrator", kind="run_finish", status="error"
                )
            )
    finally:
        # Keep the bus open briefly so WS clients can drain the final events.
        await asyncio.sleep(0.2)
        registry.remove(run_id)


class AnswerRequest(BaseModel):
    answer: str


@router.post("/{run_id}/answer")
async def answer_ask_user(run_id: str, req: AnswerRequest) -> dict:
    """Resolve a pending ask_user broker future and emit a synthetic
    `user_answer` UIEvent so it shows in the trace immediately (the broker
    will also emit one from inside the tool, but emitting here gives feedback
    even if the agent loop is slow to pick it up)."""
    bus = registry.get(run_id)
    if bus is None:
        raise HTTPException(status_code=404, detail="run not found")
    resolved = broker.resolve(run_id, req.answer)
    return {"ok": True, "resolved": resolved}


@router.get("/{run_id}/artifacts")
async def list_artifacts(run_id: str) -> list[dict]:
    return [
        {"name": a.name, "mime": a.mime, "size": len(a.content)}
        for a in artifacts.list(run_id)
    ]


@router.get("/{run_id}/artifacts/{name}")
async def get_artifact(run_id: str, name: str) -> dict:
    a = artifacts.get(run_id, name)
    if a is None:
        raise HTTPException(status_code=404, detail="artifact not found")
    return {"name": a.name, "mime": a.mime, "content": a.content}


async def _emit_fake_trace(run_id: str, question: str) -> None:
    """Offline demo trace — no LLM required. Useful for UI development and
    for verifying the WS pipe without OpenCode Zen credentials."""
    bus = registry.get(run_id)
    if bus is None:
        return

    def ev(kind, label, *, parent_id=None, agent_id="orchestrator", status=None, payload=None):
        e = UIEvent(
            run_id=run_id,
            kind=kind,
            label=label,
            parent_id=parent_id,
            agent_id=agent_id,
            status=status,
            payload=payload or {},
        )
        bus.push(e)
        return e

    ev("run_start", f"Research: {question}", status="running")
    await asyncio.sleep(0.3)

    ev("thinking", "Decomposing research question", status="ok")
    await asyncio.sleep(0.3)

    spawn = ev("subagent_spawn", "Spawning 3 web researchers in parallel", status="running")
    await asyncio.sleep(0.1)

    researchers = []
    for i in range(1, 4):
        rid = ev(
            "agent_start",
            f"researcher_{i}",
            parent_id=spawn.id,
            agent_id=f"researcher_{i}",
            status="running",
        )
        researchers.append(rid)
        ev(
            "tool_call",
            "web_search",
            parent_id=rid.id,
            agent_id=f"researcher_{i}",
            status="running",
            payload={"query": f"aspect {i} of: {question}"},
        )

    await asyncio.sleep(0.8)
    for i, r in enumerate(researchers, 1):
        ev(
            "tool_result",
            "5 sources found",
            parent_id=r.id,
            agent_id=f"researcher_{i}",
            status="ok",
            payload={"count": 5},
        )
        ev(
            "agent_finish",
            f"researcher_{i} done",
            parent_id=r.id,
            agent_id=f"researcher_{i}",
            status="ok",
        )

    ev("subagent_finish", "All researchers complete", parent_id=spawn.id, status="ok")

    analyst = ev("agent_start", "analyst", agent_id="analyst", status="running")
    await asyncio.sleep(0.5)
    ev("agent_finish", "Analysis complete", parent_id=analyst.id, agent_id="analyst", status="ok")

    writer = ev("agent_start", "writer", agent_id="writer", status="running")
    await asyncio.sleep(0.5)

    fake_report = f"""# Research Report

## Executive summary
This is a demo trace produced without calling the LLM. Original question:
> {question}

## Key findings
- Demo bullet 1 [https://example.com/a]
- Demo bullet 2 [https://example.com/b]
- Demo bullet 3 [https://example.com/c]

## Details
The fake trace exists so the UI can be exercised without OpenCode Zen credentials.
"""
    artifacts.put(run_id, _make_artifact("research_report.md", fake_report))

    ev(
        "artifact",
        "research_report.md",
        parent_id=writer.id,
        agent_id="writer",
        status="ok",
        payload={"name": "research_report.md", "mime": "text/markdown", "preview": fake_report[:500], "size": len(fake_report)},
    )
    ev("agent_finish", "Report written", parent_id=writer.id, agent_id="writer", status="ok")

    ev("run_finish", "Done", status="ok")


def _make_artifact(name: str, content: str):
    from app.artifacts import Artifact

    return Artifact(name=name, mime="text/markdown", content=content)
