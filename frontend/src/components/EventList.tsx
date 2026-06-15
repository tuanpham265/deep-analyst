import { useEffect, useRef } from 'react'
import {
  Activity,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileText,
  Loader2,
  MessageCircleQuestion,
  Network,
  Play,
  Sparkles,
  Wrench,
} from 'lucide-react'
import clsx from 'clsx'
import { useRunStore } from '../store'
import type { UIEventKind, UIEventStatus } from '../types'

const KIND_ICON: Record<UIEventKind, typeof Activity> = {
  run_start: Play,
  agent_start: Sparkles,
  thinking: Brain,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  subagent_spawn: Network,
  subagent_finish: CheckCircle2,
  ask_user: MessageCircleQuestion,
  user_answer: MessageCircleQuestion,
  artifact: FileText,
  agent_finish: CheckCircle2,
  run_finish: CheckCircle2,
  error: CircleAlert,
}

const STATUS_COLOR: Record<NonNullable<UIEventStatus>, string> = {
  pending: 'text-[var(--color-text-dim)]',
  running: 'text-[var(--color-running)]',
  ok: 'text-[var(--color-ok)]',
  error: 'text-[var(--color-error)]',
}

export function EventList() {
  const events = useRunStore((s) => s.events)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-text-dim)] text-sm">
        No events yet. Submit a question to start.
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <ul className="divide-y divide-[var(--color-border)]">
        {events.map((e) => {
          const Icon = KIND_ICON[e.kind] ?? Activity
          const statusCls = e.status ? STATUS_COLOR[e.status] : 'text-[var(--color-text-dim)]'
          const isRunning = e.status === 'running'
          return (
            <li key={e.id} className="px-4 py-2 hover:bg-[var(--color-panel)] flex items-start gap-3">
              <div className={clsx('mt-0.5 flex-shrink-0', statusCls)}>
                {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--color-text-bright)] font-medium">{e.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                    {e.kind.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-dim)] mt-0.5">
                  <span className="font-mono">{e.agent_id}</span>
                  {Object.keys(e.payload).length > 0 && (
                    <>
                      <ChevronRight className="w-3 h-3" />
                      <span className="font-mono truncate">{previewPayload(e.payload)}</span>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function previewPayload(p: Record<string, unknown>): string {
  const s = JSON.stringify(p)
  return s.length > 80 ? `${s.slice(0, 80)}…` : s
}
