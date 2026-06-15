import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import { cancelRun } from '../api'
import { useRunStore } from '../store'

const STATUS_LABEL: Record<string, string> = {
  idle: 'Idle',
  starting: 'Starting',
  running: 'Running',
  done: 'Done',
  error: 'Error',
}

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-[var(--color-text-dim)]',
  starting: 'bg-[var(--color-running)] animate-pulse',
  running: 'bg-[var(--color-running)] animate-pulse',
  done: 'bg-[var(--color-ok)]',
  error: 'bg-[var(--color-error)]',
}

function useElapsed(startedAt: number | null, endedAt: number | null) {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!startedAt || endedAt) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [startedAt, endedAt])
  if (!startedAt) return null
  const end = endedAt ?? now
  return Math.max(0, end - startedAt)
}

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}m ${(s - m * 60).toFixed(0)}s`
}

export function StatusBar() {
  const status = useRunStore((s) => s.status)
  const mode = useRunStore((s) => s.mode)
  const connected = useRunStore((s) => s.connected)
  const runId = useRunStore((s) => s.runId)
  const errorMessage = useRunStore((s) => s.errorMessage)
  const eventCount = useRunStore((s) => s.events.length)
  const startedAt = useRunStore((s) => s.startedAt)
  const endedAt = useRunStore((s) => s.endedAt)
  const setStatus = useRunStore((s) => s.setStatus)
  const elapsed = useElapsed(startedAt, endedAt)
  const isRunning = status === 'running' || status === 'starting'

  async function onAbort() {
    if (!runId) return
    try {
      await cancelRun(runId)
      setStatus('error', 'cancelled by user')
    } catch (e) {
      setStatus('error', e instanceof Error ? e.message : 'cancel failed')
    }
  }

  return (
    <div className="flex items-center gap-3 text-xs text-[var(--color-text-dim)]">
      {isRunning && runId && (
        <button
          type="button"
          onClick={onAbort}
          className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-error)] hover:bg-[var(--color-error)]/10 border border-[var(--color-error)]/40"
          title="Abort the current run"
        >
          <Square className="w-3 h-3 fill-current" />
          Abort
        </button>
      )}
      {mode && (
        <span
          className={
            mode === 'demo'
              ? 'px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-[var(--color-accent-bg)] text-[var(--color-accent)]'
              : 'px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider bg-[var(--color-panel)] text-[var(--color-text-dim)]'
          }
          title={mode === 'demo' ? 'Offline demo trace (no LLM calls)' : 'Real LLM run via OpenCode Zen'}
        >
          {mode}
        </span>
      )}
      {runId && <span className="font-mono">{runId.slice(0, 8)}</span>}
      <span>{eventCount} events</span>
      {elapsed !== null && <span className="font-mono">{fmtMs(elapsed)}</span>}
      <span className="px-2 py-0.5 rounded-full flex items-center gap-1.5 bg-[var(--color-panel)]">
        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`} />
        {STATUS_LABEL[status]}
        {!connected && status === 'running' && ' (reconnecting…)'}
      </span>
      {errorMessage && (
        <span className="text-[var(--color-error)]" title={errorMessage}>
          {errorMessage.slice(0, 40)}
        </span>
      )}
    </div>
  )
}
