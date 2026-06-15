# Deep Analyst — Design Doc

**Author:** Tuan Pham · **Date:** 2026-05-28 · **Status:** Submitted

---

## Tenets

1. **The trace is the product.** Every architectural choice optimizes for "did the user see exactly what the agent did?" — not for backend ergonomics.
2. **Event contracts beat implementation coupling.** The frontend reducer has no idea OpenHands exists; the backend decoder has no idea what React renders. A single typed `UIEvent` mediates them.
3. **Demoable without credentials.** Every reviewer can clone, `npm install`, and see the UI work end-to-end without an API key. Real-LLM mode is a config flip, not a code path divergence.

## Problem

The Accelerate Data take-home asks for a chat app that gives "full transparency into AI agent behavior — reasoning, tool calls, sub-agent orchestration, and artifacts — rendered in real time." The hard parts: (1) decoding the agent's event stream into a tree that mirrors causality, (2) showing parallel sub-agents as concurrent siblings (not sequentialized), (3) supporting `ask_user` pause/resume, (4) doing it with OpenHands SDK + a free OpenCode Zen model the reviewer may not have set up.

## Proposed solution

A **two-process app + one mediating event contract**:

- **Backend** (FastAPI, Python): runs a 4-stage Python orchestrator that drives one OpenHands `Conversation` per sub-agent. Each Conversation runs in a worker thread; its event callback decodes OpenHands `Event`s into typed `UIEvent`s and pushes them onto a per-run `asyncio.Queue`. A WS endpoint drains the queue.
- **Frontend** (React + Vite + Zustand): one hook consumes the WS stream; one **pure reducer** turns the flat event list into a tree via `parent_id` linking. The tree component renders recursively; a right-pane drawer shows the raw payload of the selected node.

### Why Python orchestration instead of OpenHands' `DelegateTool`?

OpenHands' built-in delegation runs parallel sub-agents in threads but **consolidates child events into one observation at the parent**, erasing per-sub-step granularity in the trace. Since per-sub-agent granularity *is* the product, the orchestrator is plain Python and each sub-agent gets its own Conversation + its own event callback tagged with `agent_id="researcher_1"`, `parent_id=<spawn_node>`. Trade-off: slightly more orchestration code, but the trace tree shows every researcher's thinking and tool calls as concurrent siblings — which is exactly what reviewers should see.

### Key design questions, answered

| Question | Answer |
|---|---|
| Single message or multiple? | One WS stream of typed `UIEvent`s. 13 `kind`s cover every observable agent state. Frontend never polls. |
| How do parallel agents appear? | As siblings under a `subagent_spawn` node, all in `running` state simultaneously. The reducer preserves insertion order so the eye can follow the fan-out. |
| What happens during `ask_user`? | The agent thread blocks on a `concurrent.futures.Future` in `AskUserBroker`. The tool emits a synthetic `ask_user` `UIEvent` before blocking. The UI shows a modal; on submit, `POST /api/runs/{id}/answer` resolves the future, the agent resumes, the tool emits a `user_answer` event. The WS stream stays open the whole time — no reconnect needed. |
| How are artifacts surfaced? | The writer agent's final output is stored in an `ArtifactStore` keyed by `run_id`. An `artifact` `UIEvent` carries the name + preview in its payload, and the frontend's Artifacts tab fetches the full content from `GET /api/runs/{id}/artifacts/{name}` on click. |
| What if the WS drops mid-run? | The hook reconnects with exponential backoff up to 8s. Re-sent events would duplicate (no replay endpoint yet — see Open Questions). |
| What if there's no API key? | The backend auto-falls-back to `demo` mode, emitting a hardcoded fake trace that exercises every event kind. The frontend shows a `demo` badge in the status bar. |

## Goals

- Trace tree faithfully reflects parent/child relationships from OpenHands `tool_call_id` linkage.
- Parallel researchers visibly run concurrently.
- `ask_user` round-trip works end-to-end without losing events.
- Decoder + reducer are pure, unit-tested (17 + 9 tests = 26 total).
- App runs without an API key (demo trace) for reviewers who haven't registered.

## Non-goals

- Multi-tenant isolation (single-process, in-memory state).
- Run history / persistence across page refresh.
- Streaming token-by-token thinking text (events arrive at action-level granularity, not token-level — sufficient for the trace).
- Production-grade tool sandboxing (researcher uses scraped DuckDuckGo HTML, not a hardened search API).
- Domain B (PipeForge) — explicitly chose Domain A for its richer parallel-fan-out visualization.

## Open questions / next steps

1. **WS reconnect replay.** Reconnect re-establishes the socket but doesn't replay missed events. A monotonic `seq_id` + `GET /api/runs/{id}/events?since=N` would close the gap.
2. **Run history.** Each new question replaces the previous trace. Storing completed runs (events + artifacts) keyed by `run_id` with a sidebar list would unlock multi-run review.
3. **Stronger free models.** Qwen3-Coder is competent but verbose — the researcher's system prompt aggressively caps tool calls to keep traces readable. A larger model would let the prompts relax.
4. **`ask_user` autonomy.** The tool is wired but the writer's system prompt doesn't currently trigger it. Extending the orchestrator to detect ambiguous user questions and seed an explicit "ask first" loop is the natural follow-up.
5. **Sub-agent isolation in OpenHands.** Each Conversation runs in a temp workspace dir; cleanup happens implicitly via tempfile. Production would want explicit lifecycle + per-run quota.
