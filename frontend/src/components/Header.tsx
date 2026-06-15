import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'
import { cancelRun } from '../api'
import { useRunStore } from '../store'
import { Logo } from './Logo'

interface Props {
  showNewRun?: boolean
  onNewRun?: () => void
}

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  idle: { color: 'var(--color-muted-2)', label: 'Idle' },
  starting: { color: 'var(--color-accent)', label: 'Starting' },
  running: { color: 'var(--color-accent)', label: 'Running' },
  done: { color: 'var(--color-status-ok)', label: 'Done' },
  error: { color: 'var(--color-status-error)', label: 'Error' },
}

function Chip({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex gap-1.5 items-baseline px-2.5 py-1 rounded-[9px] bg-white border border-[var(--color-border)]">
      <span className="font-mono text-[11.5px] font-semibold text-[var(--color-ink)]">
        {value}
      </span>
      <span className="text-[9.5px] text-[var(--color-muted-2)] font-bold uppercase tracking-wider">
        {label}
      </span>
    </div>
  )
}

export function Header({ showNewRun, onNewRun }: Props) {
  const status = useRunStore((s) => s.status)
  const mode = useRunStore((s) => s.mode)
  const runId = useRunStore((s) => s.runId)
  const eventCount = useRunStore((s) => s.events.length)
  const startedAt = useRunStore((s) => s.startedAt)
  const endedAt = useRunStore((s) => s.endedAt)
  const setStatus = useRunStore((s) => s.setStatus)

  const isRunning = status === 'running' || status === 'starting'
  const statusEntry = STATUS_MAP[status] ?? STATUS_MAP.idle

  // Tick a local clock so the elapsed counter stays live between store events.
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!startedAt || endedAt) return
    const id = setInterval(() => setTick((t) => t + 1), 250)
    return () => clearInterval(id)
  }, [startedAt, endedAt])

  let elapsedStr = ''
  if (startedAt) {
    const end = endedAt ?? Date.now()
    const ms = Math.max(0, end - startedAt)
    if (ms < 1000) elapsedStr = `${ms}ms`
    else if (ms < 60_000) elapsedStr = `${(ms / 1000).toFixed(1)}s`
    else {
      const m = Math.floor(ms / 60_000)
      const s = Math.round((ms % 60_000) / 1000)
      elapsedStr = `${m}m ${s}s`
    }
  }

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
    <header
      className="h-14 flex-shrink-0 flex items-center justify-between px-[18px] border-b border-[var(--color-border)] z-10"
      style={{
        background: 'rgba(255,255,255,.72)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="flex items-center gap-[11px]">
        <Logo />
        <div className="flex flex-col leading-[1.12]">
          <span className="font-extrabold text-[15px] tracking-tight text-[var(--color-ink)]">
            Deep Analyst
          </span>
          <span className="text-[10.5px] text-[var(--color-muted-2)] font-semibold">
            Multi-agent trace viewer
          </span>
        </div>
        {mode && (
          <span
            className="ml-1 font-mono text-[9.5px] font-semibold tracking-wider px-[7px] py-[3px] rounded-md"
            style={{
              color: mode === 'demo' ? 'var(--color-accent)' : 'var(--color-status-ok)',
              background:
                mode === 'demo'
                  ? 'var(--color-accent-bg)'
                  : 'rgba(16,185,129,0.09)',
              border:
                mode === 'demo'
                  ? '1px solid var(--color-accent-border)'
                  : '1px solid rgba(16,185,129,0.18)',
            }}
            title={
              mode === 'demo'
                ? 'Demo trace (no LLM calls)'
                : 'Real LLM run via OpenCode Zen'
            }
          >
            {mode === 'demo' ? 'DEMO TRACE' : 'REAL'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-[11px]">
        {runId && (
          <span className="font-mono text-[11px] text-[var(--color-muted-2)]">
            #{runId.slice(0, 8)}
          </span>
        )}
        <Chip value={String(eventCount)} label="events" />
        {elapsedStr && <Chip value={elapsedStr} label="elapsed" />}

        <div className="flex gap-[7px] items-center px-3 py-1.5 rounded-full bg-white border border-[var(--color-border)]">
          <span
            className={`w-[7px] h-[7px] rounded-full ${isRunning ? 'animate-pulse-soft' : ''}`}
            style={{
              background: statusEntry.color,
              boxShadow: `0 0 0 3px ${statusEntry.color}22`,
            }}
          />
          <span className="text-[11.5px] font-bold text-[var(--color-ink)]">
            {statusEntry.label}
          </span>
        </div>

        {isRunning && runId && (
          <button
            type="button"
            onClick={onAbort}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer"
            style={{
              color: 'var(--color-status-error)',
              borderColor: 'rgba(244,63,94,0.3)',
              background: 'rgba(244,63,94,0.06)',
            }}
            title="Abort the current run"
          >
            <Square className="w-3 h-3 fill-current" />
            Abort
          </button>
        )}

        {showNewRun && (
          <button
            type="button"
            onClick={onNewRun}
            className="font-sans text-xs font-bold text-[var(--color-ink)] bg-white border border-[var(--color-border)] px-3 py-1.5 rounded-[9px] cursor-pointer shadow-sm hover:bg-[var(--color-card-2)]"
          >
            New run
          </button>
        )}
      </div>
    </header>
  )
}
