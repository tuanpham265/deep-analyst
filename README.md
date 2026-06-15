# Deep Analyst — Multi-Agent Research with Full Trace Transparency

A real-time chat application that runs a **multi-agent research pipeline** and renders **every step** — reasoning, tool calls, parallel sub-agent execution, errors, and generated artifacts — as a live, color-coded trace tree.

You ask a research question. An orchestrator decomposes it into 3 sub-queries, dispatches three web researchers in **parallel**, then runs an analyst (synthesis) and a writer (final markdown report with citations). The whole pipeline streams over WebSocket into a trace tree you can navigate, inspect, and zoom on.

Built as the take-home capstone for **Accelerate Data**.

### Tech stack

| Layer | Choice |
|---|---|
| Agent runtime | **[OpenHands SDK](https://github.com/OpenHands/software-agent-sdk)** (Python) |
| LLM gateway | **[OpenCode Zen](https://opencode.ai/zen)** — OpenAI-compatible, LiteLLM-backed, BYOK |
| Default model | `openai/gpt-5-nano` (fast, function-calling capable, via your OpenAI BYOK on Zen) |
| Web search | **[Serper.dev](https://serper.dev)** (Google) primary → Wikipedia → DuckDuckGo HTML fallback |
| Backend | **FastAPI** + WebSockets + `asyncio` |
| Frontend | **React 19 + Vite + TypeScript + Tailwind v4 + Zustand** + `react-markdown` |
| Testing | `pytest` (17 decoder tests) + `vitest` (9 reducer tests) |

---

## Quick start

### Prerequisites

- Python ≥ 3.11
- Node.js ≥ 18 + npm
- (Optional, for real runs) An OpenCode Zen account + your own OpenAI or Anthropic key configured as BYOK at <https://opencode.ai/auth>
- (Optional, for Google-quality search) A Serper API key from <https://serper.dev> (free tier = 2,500 queries)

> **Without any keys, the app runs in demo mode** — a hardcoded 22-event trace + sample artifact. The whole UI is exercisable with zero credentials.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
# source .venv/bin/activate     # macOS / Linux
pip install -e .

cp .env.example .env
# edit .env — set OPENCODE_ZEN_API_KEY, OPENHANDS_MODEL, SERPER_API_KEY

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Backend serves at `http://127.0.0.1:8000`. Visit `/docs` for the OpenAPI UI.

### 2. Frontend (in a second terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend serves at `http://127.0.0.1:5173`. The Vite dev proxy forwards `/api/*` and `/ws/*` to the backend on `:8000` — no CORS setup needed.

### 3. Use it

Open <http://127.0.0.1:5173> in a browser. You land on the **"What should we research?"** screen. Submit a question (or click an example chip).

Try: *"What are recent breakthroughs in fusion energy from 2024–2025?"*

You'll see, in real time:

1. **Pipeline row** at the top lights up: **Plan → Research → Analyze → Write**
2. **Trace tree** (center pane): the orchestrator decomposes, spawns 3 researchers in parallel (visible as siblings), each calls `web_search`, an analyst synthesizes, a writer drafts
3. **Inspector** (right pane): tabs for **Detail** (raw event payload) and **Artifacts**
4. When the writer produces `research_report.md`, the **Artifacts** tab auto-opens with the rendered markdown
5. The **Expand** button (top-right of artifact panel) opens a centered full-screen reader for the report

Mid-run, the **Abort** button in the header cancels the run. Click **New run** (top-right) to return to the landing screen.

---

## Configuration

All settings come from `backend/.env` (see `backend/.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `OPENCODE_ZEN_API_KEY` | _(empty)_ | OpenCode Zen API key. If empty, runs auto-fall-back to the demo trace. |
| `OPENHANDS_MODEL` | `openai/gpt-5-nano` | LiteLLM model ID. Format is `openai/<zen-model-id>` since Zen is OpenAI-compatible. |
| `OPENHANDS_BASE_URL` | `https://opencode.ai/zen/v1` | LLM endpoint. |
| `SERPER_API_KEY` | _(empty)_ | Serper.dev (Google) API key. If empty, web_search falls back to Wikipedia → DDG. |
| `BACKEND_HOST` | `127.0.0.1` | uvicorn bind host. |
| `BACKEND_PORT` | `8000` | uvicorn bind port. |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin (when frontend runs separately). |

Force demo mode for a single run with `?demo=1` on `POST /api/runs`.

### Picking a model

OpenCode Zen brokers many models — most of them as BYOK (you bring your own OpenAI / Anthropic / Gemini key, Zen forwards). Configure BYOK once at <https://opencode.ai/auth> → "Bring Your Own Key".

Verified-working defaults (in order of recommendation):

| Model | Notes |
|---|---|
| `openai/gpt-5-nano` | Fast, cheap, function-calling, non-reasoning. **Recommended.** |
| `openai/gpt-5.4-nano` | Slightly newer variant of the same. |
| `openai/claude-haiku-4-5` | Excellent at following instructions, slightly slower. Requires Anthropic BYOK. |
| `openai/nemotron-3-super-free` | Free, but slow per-turn (30+ s). Useful for zero-budget demos. |

Models flagged as `*-free` may have promotional expirations on your account — check at runtime.

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  React + Vite + TS Frontend (Plus Jakarta Sans / JetBrains Mono)    │
│  ┌─────────────────┬────────────────────────┬───────────────────┐  │
│  │  Header         │  Execution trace card   │  Inspector card   │  │
│  │  (logo + chips) │  (color-coded events,   │  Detail / Arts /  │  │
│  │                 │   parent-child tree)    │  full-screen view │  │
│  ├─────────────────┴────────────────────────┴───────────────────┤  │
│  │  PipelineRow:  Plan → Research → Analyze → Write              │  │
│  └────────────────────────────────────────────────────────────────┤
│            │ WebSocket (events) + REST (start / answer / cancel)   │
└────────────┼────────────────────────────────────────────────────────┘
             ▼
┌────────────────────────────────────────────────────────────────────┐
│  FastAPI Backend                                                    │
│   POST /api/runs                  WS  /ws/{run_id}                  │
│   POST /api/runs/{id}/answer      GET /api/runs/{id}/artifacts      │
│   POST /api/runs/{id}/cancel      GET /api/runs/{id}/artifacts/{f}  │
│                                                                     │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  RunEventBus (per-run asyncio.Queue, thread-safe push,     │   │
│   │  drops late events after run_finish for clean trace)       │   │
│   │  ↑ decoder.decode: OpenHands Event → typed UIEvent         │   │
│   └────────────────────────────────────────────────────────────┘   │
│             ▲                                                       │
│             │ Conversation(callbacks=[on_event]) in worker thread   │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  Python orchestrator (run_research)                        │   │
│   │   ├─ Deterministic 3-way decomposition (no LLM)            │   │
│   │   ├─ researcher × 3   (asyncio.gather, 120 s budget each)  │   │
│   │   │     └ web_search → Serper / Wikipedia / DDG            │   │
│   │   ├─ analyst          (90 s budget, synthesizes 3 streams) │   │
│   │   └─ writer           (120 s budget, emits artifact)       │   │
│   │  Each step bounded by max_iteration_per_run=5              │   │
│   │  LLM: LiteLLM → OpenCode Zen → BYOK provider               │   │
│   └────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

### Event flow

1. **`POST /api/runs`** returns `{run_id, mode}` (`real` if API key set, else `demo`) and schedules `run_research` as an asyncio task tracked on the run's bus.
2. The frontend opens **`/ws/{run_id}`**; the backend drains the run's queue and pushes each event as JSON.
3. `run_research` (in `backend/app/runtime/orchestrator.py`) drives the pipeline:
   - **Decompose** the question into 3 sub-queries (deterministic — no LLM).
   - **`asyncio.gather`** three researcher `Conversation`s via `asyncio.to_thread`, each wrapped in `asyncio.wait_for(timeout=120s)`.
   - **Analyst** runs sequentially (`asyncio.wait_for(90s)`), receives the three streams as one prompt.
   - **Writer** runs sequentially (`asyncio.wait_for(120s)`), produces `research_report.md`.
4. Each `Conversation` registers an `on_event` callback. Every OpenHands SDK `Event` is decoded into one or more `UIEvent`s (see `backend/app/events/decoder.py`).
5. The frontend reducer (`frontend/src/reducer.ts`) builds the trace tree from the flat event stream by linking children to parents via `parent_id`.

### Sub-agent strategy (the load-bearing decision)

OpenHands' built-in `DelegateTool` runs parallel sub-agents in threads but **consolidates child events into a single observation at the parent**. That would erase per-sub-agent granularity — which is exactly what this app visualizes.

**Mitigation:** the orchestrator is **plain Python** (not an OpenHands agent), and each sub-agent is its own `Conversation` with its own callback. The callback tags every event with `agent_id` (e.g. `researcher_1`) and `parent_id` (the spawn node), so the tree shows each child's thinking, tool calls, and results as siblings under one parent.

### Bounded runtime

| Concern | Defense |
|---|---|
| Runaway agent loop | `max_iteration_per_run=5` per Conversation (≈ 2 tool calls + summary) |
| Slow LLM stalling the pipeline | `asyncio.wait_for` per sub-agent (90–120 s budgets) |
| User abort | `POST /api/runs/{id}/cancel` + Abort button cancels the asyncio task |
| Late events after timeout | Bus drops pushes after `run_finish` arrives (Python can't kill threads, so OpenHands workers may still emit — these are silently dropped UI-side) |
| Malformed tool call | `web_search` returns a helpful "missing query" observation instead of a Pydantic stack trace |

### Resilient web search

The `web_search` tool tries three backends in order. The agent doesn't have to choose — all return the same markdown format with `(source: ...)` tagged.

| Backend | When used | Free tier |
|---|---|---|
| **Serper.dev** (real Google) | If `SERPER_API_KEY` is set | 2,500 queries |
| **Wikipedia** (`action=query&list=search`) | Always available, used when Serper returns 0 hits or is disabled | Unlimited |
| **DuckDuckGo HTML** | Last resort; aggressively rate-limited by DDG | n/a |

---

## Folder structure

```
chat-app-capstone/
│
├── backend/                              FastAPI + OpenHands SDK
│   ├── app/
│   │   ├── __init__.py                   Injects truststore (Windows CA)
│   │   ├── main.py                       FastAPI app, CORS, routers
│   │   ├── config.py                     pydantic Settings (loads .env)
│   │   │
│   │   ├── api/
│   │   │   ├── runs.py                   POST /api/runs, /answer, /cancel; GET /artifacts
│   │   │   └── ws.py                     WebSocket /ws/{run_id} drains the run's bus
│   │   │
│   │   ├── events/
│   │   │   ├── types.py                  UIEvent Pydantic model (single FE/BE contract)
│   │   │   ├── bus.py                    RunEventBus (per-run asyncio.Queue) + registry
│   │   │   └── decoder.py                ⭐ OpenHands Event → UIEvent
│   │   │
│   │   ├── runtime/
│   │   │   ├── orchestrator.py           ⭐ async pipeline (3 researchers || + analyst + writer)
│   │   │   ├── agent_runtime.py          run_subagent: drives one Conversation in a thread
│   │   │   └── ask_user.py               AskUserBroker (sync Future, thread ↔ asyncio)
│   │   │
│   │   ├── agents/
│   │   │   └── builders.py               System prompts + Agent factories (3 personas)
│   │   │
│   │   ├── tools/
│   │   │   ├── web_search.py             Serper → Wikipedia → DDG cascade
│   │   │   └── ask_user.py               ask_user tool that blocks on the broker
│   │   │
│   │   └── artifacts/
│   │       └── store.py                  In-memory artifact registry by run_id
│   │
│   ├── tests/
│   │   └── test_decoder.py               ⭐ 17 unit tests (30% of the rubric weight)
│   │
│   ├── pyproject.toml                    Deps + pytest config
│   └── .env.example                      Documented env-var template
│
├── frontend/                             React + Vite + TypeScript + Tailwind
│   ├── src/
│   │   ├── main.tsx                      Vite entry, renders <App />
│   │   ├── App.tsx                       Landing vs Run screen branching
│   │   ├── index.css                     Light theme tokens, fonts, prose styles
│   │   │
│   │   ├── types.ts                      UIEvent TS mirror of backend
│   │   ├── api.ts                        startRun, sendAnswer, cancelRun, fetchArtifact
│   │   ├── store.ts                      Zustand: runId, events, tree, artifacts, status
│   │   ├── reducer.ts                    ⭐ Pure UIEvent[] → TraceTree (parent_id links)
│   │   ├── reducer.test.ts               9 vitest tests
│   │   ├── theme.ts                      Per-agent color mapping + pipeline progress calc
│   │   ├── useEventStream.ts             WS hook w/ exponential-backoff reconnect
│   │   │
│   │   └── components/
│   │       ├── Logo.tsx                  Branded gradient logo
│   │       ├── Header.tsx                Logo + DEMO/REAL badge + chips + Abort + New run
│   │       ├── Landing.tsx               "What should we research?" hero + examples
│   │       ├── PipelineRow.tsx           4-stage progress bar (Plan → Research → Analyze → Write)
│   │       ├── TraceTree.tsx             Recursive tree, color-coded per agent
│   │       ├── NodeDetail.tsx            Right-pane: icon header + fact rows + JSON payload
│   │       ├── ArtifactsPanel.tsx        Markdown render + Source toggle + full-screen viewer
│   │       ├── AskUserPrompt.tsx         Modal triggered by ask_user events
│   │       ├── ChatInput.tsx             (legacy, kept for reference)
│   │       ├── EventList.tsx             (legacy flat-list view, replaced by TraceTree)
│   │       └── StatusBar.tsx             (legacy header chip group, replaced by Header)
│   │
│   ├── vite.config.ts                    Tailwind v4 plugin + dev proxy (/api, /ws → :8000)
│   └── package.json
│
├── README.md                             this file
├── DESIGN.md                             1-page Amazon-style design doc
└── LICENSE                               MIT
```

---

## Tests

### Backend — decoder unit tests (30% of the rubric)

```bash
cd backend
.venv\Scripts\python.exe -m pytest -v
```

**17 tests** cover every OpenHands event type:
- `ActionEvent` with / without `thought` and `reasoning_content`
- `ObservationEvent.action_id` linkage (this is how the tree is built)
- `MessageEvent` role / source dispatch
- `AgentErrorEvent` mapping
- Filtered events (`SystemPromptEvent`, `StreamingDeltaEvent`, etc.)
- `parent_id` fallback for events without a natural link
- `run_id` and `agent_id` propagation

### Frontend — reducer tests

```bash
cd frontend
npm test
```

**9 tests** cover the pure tree-building reducer:
- Root vs child linking via `parent_id`
- Orphan events (parent unknown) becoming roots
- `tool_result` status propagating onto its `tool_call` parent
- `agent_finish` / `subagent_finish` / `run_finish` propagating back onto their opener
- Insertion-order preservation for parallel siblings
- DFS flatten ordering
- Immutability (pure function — no input mutation)

---

## Known limitations

- **No persistence.** Refreshing the page during a run drops the trace in the UI (the run continues server-side, but the client can't reconnect to historical events — events are pushed, not pulled). A persistent event log + `GET /api/runs/{id}/events?since=N` is the natural next step.
- **Single process / in-memory state.** `RunEventBus`, `ArtifactStore`, and `AskUserBroker` are dicts. Production deployment would swap these for Redis / object storage.
- **No multi-run history in the UI.** Each new question replaces the previous trace. Artifacts persist in the backend store until the process restarts but aren't surfaced across runs.
- **Free-tier LLMs are weak.** The researcher prompt aggressively caps tool calls; stronger models (Claude Sonnet, GPT-5) produce richer traces but cost more.
- **`ask_user` is wired but not auto-triggered.** The tool exists and round-trips through the broker + UI modal, but the writer's system prompt doesn't currently demand clarification. Easy to enable by extending the prompt.
- **Late OpenHands worker threads.** When a sub-agent times out, the orchestrator stops waiting but Python can't kill the thread. The bus drops their late events so the UI stays clean.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
