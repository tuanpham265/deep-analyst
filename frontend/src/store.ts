import { create } from 'zustand'
import type { UIEvent } from './types'
import { applyEvent, emptyTree, type TraceTree } from './reducer'

export interface Artifact {
  name: string
  mime: string
  size: number
}

interface RunState {
  runId: string | null
  mode: 'real' | 'demo' | null
  question: string | null
  events: UIEvent[]
  tree: TraceTree
  artifacts: Record<string, Artifact>
  connected: boolean
  status: 'idle' | 'starting' | 'running' | 'done' | 'error'
  errorMessage: string | null
  startedAt: number | null
  endedAt: number | null
  pendingAsk: UIEvent | null
  selectedNodeId: string | null
  setRun: (runId: string, mode: 'real' | 'demo', question: string) => void
  setConnected: (v: boolean) => void
  setStatus: (s: RunState['status'], err?: string | null) => void
  pushEvent: (e: UIEvent) => void
  setSelected: (id: string | null) => void
  clearAsk: () => void
  reset: () => void
}

export const useRunStore = create<RunState>((set) => ({
  runId: null,
  mode: null,
  question: null,
  events: [],
  tree: emptyTree(),
  artifacts: {},
  connected: false,
  status: 'idle',
  errorMessage: null,
  startedAt: null,
  endedAt: null,
  pendingAsk: null,
  selectedNodeId: null,
  setRun: (runId, mode, question) =>
    set({ runId, mode, question, startedAt: Date.now(), endedAt: null }),
  setConnected: (connected) => set({ connected }),
  setStatus: (status, errorMessage = null) => set({ status, errorMessage }),
  pushEvent: (e) =>
    set((s) => {
      const events = [...s.events, e]
      const tree = applyEvent(s.tree, e)
      let artifacts = s.artifacts
      if (e.kind === 'artifact') {
        const name = String(e.payload['name'] ?? e.label)
        artifacts = {
          ...artifacts,
          [name]: {
            name,
            mime: String(e.payload['mime'] ?? 'text/plain'),
            size: Number(e.payload['size'] ?? 0),
          },
        }
      }
      const pendingAsk =
        e.kind === 'ask_user' ? e : e.kind === 'user_answer' || e.kind === 'run_finish' ? null : s.pendingAsk
      const endedAt = e.kind === 'run_finish' ? Date.now() : s.endedAt
      const status = e.kind === 'run_finish' ? (e.status === 'error' ? 'error' : 'done') : s.status
      return { events, tree, artifacts, pendingAsk, endedAt, status }
    }),
  setSelected: (selectedNodeId) => set({ selectedNodeId }),
  clearAsk: () => set({ pendingAsk: null }),
  reset: () =>
    set({
      runId: null,
      mode: null,
      question: null,
      events: [],
      tree: emptyTree(),
      artifacts: {},
      connected: false,
      status: 'idle',
      errorMessage: null,
      startedAt: null,
      endedAt: null,
      pendingAsk: null,
      selectedNodeId: null,
    }),
}))
