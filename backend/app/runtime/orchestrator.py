"""Deep Analyst orchestrator — Python-driven multi-agent pipeline.

The orchestrator is intentionally plain Python (not an OpenHands agent
itself) so the high-level flow is explicit, easy to read, and easy to test.
Each step runs in a worker thread via asyncio.to_thread; the researcher
fan-out runs them concurrently via asyncio.gather.
"""

from __future__ import annotations

import asyncio
import logging

from openhands.sdk import LLM
from pydantic import SecretStr

from app.agents import build_analyst_agent, build_researcher_agent, build_writer_agent
from app.artifacts import Artifact, artifacts
from app.config import Settings
from app.events import RunEventBus, UIEvent
from app.runtime.agent_runtime import run_subagent

logger = logging.getLogger(__name__)

NUM_RESEARCHERS = 3

# Per-sub-agent wall-clock cap. Caveat: Python threads can't be killed, so on
# timeout the orchestrator simply stops waiting on the worker — the underlying
# OpenHands loop will keep running until it exits on its own, but no more events
# will affect the user-visible trace.
RESEARCHER_TIMEOUT_SEC = 120.0
ANALYST_TIMEOUT_SEC = 90.0
WRITER_TIMEOUT_SEC = 120.0


def _decompose(question: str) -> list[str]:
    """Deterministic sub-query decomposition — no LLM needed for the split.

    The three angles are deliberately wide so the parallel researchers don't
    return near-duplicate results.
    """
    q = question.strip().rstrip("?")
    return [
        f"{q} — recent developments, announcements, and news in 2024-2025",
        f"{q} — scientific or technical details, methods, and mechanisms",
        f"{q} — implications, expert opinion, and broader context",
    ]


def _build_llm(settings: Settings) -> LLM:
    if not settings.opencode_zen_api_key:
        raise RuntimeError(
            "OPENCODE_ZEN_API_KEY is not set. Either configure your API key in "
            "backend/.env or start a run with ?demo=1 to use the offline fake trace."
        )
    return LLM(
        usage_id=f"opencode-{settings.model}",
        model=settings.model,
        base_url=settings.base_url,
        api_key=SecretStr(settings.opencode_zen_api_key),
    )


async def run_research(
    *,
    question: str,
    run_id: str,
    bus: RunEventBus,
    settings: Settings,
) -> None:
    """Drive the full Deep Analyst flow and stream events to the bus."""

    # Set the ask_user context so the tool executor can attach UIEvents
    # to the right run/bus. Context vars are inherited by threads spawned via
    # asyncio.to_thread (PEP 567), so this propagates correctly.
    # Lazy import to avoid the app.tools <-> app.runtime circular at module load.
    from app.tools.ask_user import current_run_ctx as _ctx

    _ctx.set({"run_id": run_id, "bus": bus, "agent_id": "writer"})

    bus.push(
        UIEvent(
            run_id=run_id,
            agent_id="orchestrator",
            kind="run_start",
            status="running",
            label=f"Research: {question[:80]}",
            payload={"question": question},
        )
    )

    try:
        llm = _build_llm(settings)
    except RuntimeError as e:
        bus.push(
            UIEvent(
                run_id=run_id,
                agent_id="orchestrator",
                kind="error",
                status="error",
                label=str(e),
                payload={"hint": "Run with ?demo=1 to skip the real LLM."},
            )
        )
        bus.push(
            UIEvent(
                run_id=run_id,
                agent_id="orchestrator",
                kind="run_finish",
                status="error",
                label="Aborted: missing API key",
            )
        )
        return

    sub_queries = _decompose(question)

    plan = UIEvent(
        run_id=run_id,
        agent_id="orchestrator",
        kind="thinking",
        status="ok",
        label=f"Decomposed into {len(sub_queries)} sub-queries",
        payload={"sub_queries": sub_queries},
    )
    bus.push(plan)

    spawn = UIEvent(
        run_id=run_id,
        agent_id="orchestrator",
        kind="subagent_spawn",
        status="running",
        label=f"Spawning {len(sub_queries)} web researchers in parallel",
        payload={"count": len(sub_queries)},
    )
    bus.push(spawn)

    # Parallel researchers
    researcher_agent = build_researcher_agent(llm)

    async def _one_researcher(i: int, q: str) -> str:
        agent_id = f"researcher_{i + 1}"
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(
                    run_subagent,
                    run_id=run_id,
                    agent_id=agent_id,
                    bus=bus,
                    agent=researcher_agent,
                    prompt=f"Sub-question: {q}\n\nFollow your instructions exactly.",
                    parent_id=spawn.id,
                ),
                timeout=RESEARCHER_TIMEOUT_SEC,
            )
        except asyncio.TimeoutError:
            bus.push(
                UIEvent(
                    run_id=run_id,
                    agent_id=agent_id,
                    parent_id=spawn.id,
                    kind="error",
                    status="error",
                    label=f"{agent_id} timed out after {RESEARCHER_TIMEOUT_SEC:.0f}s",
                    payload={"timeout_sec": RESEARCHER_TIMEOUT_SEC},
                )
            )
            return f"(researcher {agent_id} timed out)"
        except Exception as e:
            logger.exception("researcher %s failed", agent_id)
            return f"(researcher {agent_id} failed: {e})"

    researcher_outputs = await asyncio.gather(
        *[_one_researcher(i, q) for i, q in enumerate(sub_queries)]
    )

    bus.push(
        UIEvent(
            run_id=run_id,
            agent_id="orchestrator",
            parent_id=spawn.id,
            kind="subagent_finish",
            status="ok",
            label="All researchers complete",
            payload={"count": len(researcher_outputs)},
        )
    )

    # Analyst (sequential)
    analyst_agent = build_analyst_agent(llm)
    analyst_prompt = "Researcher notes:\n\n" + "\n\n---\n\n".join(
        f"### Researcher {i + 1}\n{out}"
        for i, out in enumerate(researcher_outputs)
    )
    try:
        analysis = await asyncio.wait_for(
            asyncio.to_thread(
                run_subagent,
                run_id=run_id,
                agent_id="analyst",
                bus=bus,
                agent=analyst_agent,
                prompt=analyst_prompt,
            ),
            timeout=ANALYST_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        bus.push(
            UIEvent(
                run_id=run_id,
                agent_id="analyst",
                kind="error",
                status="error",
                label=f"analyst timed out after {ANALYST_TIMEOUT_SEC:.0f}s",
                payload={"timeout_sec": ANALYST_TIMEOUT_SEC},
            )
        )
        analysis = "(analyst timed out — proceeding with raw researcher notes)"
    except Exception as e:
        logger.exception("analyst failed")
        analysis = f"(analyst failed: {e})"

    # Writer (sequential) — its output is the artifact
    writer_agent = build_writer_agent(llm)
    writer_prompt = (
        f"Original user question:\n{question}\n\n"
        f"Analyst synthesis:\n{analysis}\n\n"
        f"Raw researcher notes:\n"
        + "\n\n---\n\n".join(
            f"### Researcher {i + 1}\n{out}"
            for i, out in enumerate(researcher_outputs)
        )
    )
    try:
        report_md = await asyncio.wait_for(
            asyncio.to_thread(
                run_subagent,
                run_id=run_id,
                agent_id="writer",
                bus=bus,
                agent=writer_agent,
                prompt=writer_prompt,
            ),
            timeout=WRITER_TIMEOUT_SEC,
        )
    except asyncio.TimeoutError:
        bus.push(
            UIEvent(
                run_id=run_id,
                agent_id="writer",
                kind="error",
                status="error",
                label=f"writer timed out after {WRITER_TIMEOUT_SEC:.0f}s",
                payload={"timeout_sec": WRITER_TIMEOUT_SEC},
            )
        )
        report_md = f"# Report\n\n(Writer timed out — see researcher notes in the trace.)"
    except Exception as e:
        logger.exception("writer failed")
        report_md = f"# Report\n\n(Writer failed: {e})"

    artifact = Artifact(name="research_report.md", mime="text/markdown", content=report_md or "")
    artifacts.put(run_id, artifact)

    bus.push(
        UIEvent(
            run_id=run_id,
            agent_id="writer",
            kind="artifact",
            status="ok",
            label=artifact.name,
            payload={
                "name": artifact.name,
                "mime": artifact.mime,
                "preview": artifact.content[:500],
                "size": len(artifact.content),
            },
        )
    )

    bus.push(
        UIEvent(
            run_id=run_id,
            agent_id="orchestrator",
            kind="run_finish",
            status="ok",
            label="Done",
        )
    )
