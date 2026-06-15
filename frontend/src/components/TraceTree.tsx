import { useState } from 'react'
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Flag,
  GitBranch,
  Loader2,
  MessageCircleQuestion,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'
import { useRunStore } from '../store'
import { flatten, type TraceNode } from '../reducer'
import { agentColor, isMarker } from '../theme'
import type { UIEvent, UIEventKind } from '../types'

const KIND_ICON: Record<UIEventKind, React.ComponentType<{ className?: string }>> = {
  run_start: Play,
  run_finish: Flag,
  agent_start: Sparkles,
  agent_finish: Check,
  thinking: Brain,
  tool_call: SlidersHorizontal,
  tool_result: Check,
  subagent_spawn: GitBranch,
  subagent_finish: Check,
  ask_user: MessageCircleQuestion,
  user_answer: MessageCircleQuestion,
  artifact: FileText,
  error: AlertTriangle,
}

function iconFor(e: UIEvent): React.ComponentType<{ className?: string }> {
  if (e.kind === 'tool_call') {
    if (e.label === 'web_search') return Search
    if (e.label === 'fetch_page') return Download
    return SlidersHorizontal
  }
  return KIND_ICON[e.kind] ?? Brain
}

export function TraceTree() {
  const tree = useRunStore((s) => s.tree)
  const events = useRunStore((s) => s.events)

  if (events.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--color-muted-2)] text-sm">
        Waiting for events…
      </div>
    )
  }
  const flat = flatten(tree)
  return (
    <div
      className="h-full overflow-auto py-1"
      style={{
        background: 'linear-gradient(180deg, var(--color-card-3), var(--color-card-2))',
      }}
    >
      <ul className="m-0 p-0 list-none">
        {flat.map((n) => (
          <TraceRow key={n.id} node={n} />
        ))}
      </ul>
    </div>
  )
}

function TraceRow({ node }: { node: TraceNode }) {
  const setSelected = useRunStore((s) => s.setSelected)
  const selectedId = useRunStore((s) => s.selectedNodeId)
  const [collapsed, setCollapsed] = useState(false)
  const e = node.event
  const Icon = iconFor(e)
  const col = agentColor(e.agent_id)
  const isSelected = selectedId === e.id
  const isRunning = e.status === 'running'
  const isError = e.status === 'error'
  const marker = isMarker(e)
  const hasChildren = node.childIds.length > 0
  const indent = node.depth * 22

  return (
    <li className="m-0 p-0">
      <button
        type="button"
        onClick={() => setSelected(isSelected ? null : e.id)}
        className="w-full text-left border-0 cursor-pointer animate-fadeup px-4 py-[7px] flex items-center gap-2.5 relative"
        style={{
          background: isSelected ? `${col}10` : 'transparent',
          paddingLeft: 16 + indent,
        }}
      >
        {/* Vertical guide line for nested depth */}
        {node.depth > 0 && (
          <span
            aria-hidden
            className="absolute top-0 bottom-0 w-px"
            style={{
              left: 16 + (node.depth - 1) * 22 + 11,
              background: 'var(--color-border)',
            }}
          />
        )}

        {hasChildren ? (
          <span
            role="presentation"
            className="text-[var(--color-muted-2)] flex-shrink-0"
            onClick={(ev) => {
              ev.stopPropagation()
              setCollapsed((v) => !v)
            }}
          >
            {collapsed ? (
              <ChevronRight className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </span>
        ) : (
          <span className="w-3 inline-block flex-shrink-0" />
        )}

        <span
          className={`w-[22px] h-[22px] rounded-[7px] flex-shrink-0 flex items-center justify-center ${
            isRunning ? 'animate-pulse-soft' : ''
          }`}
          style={{
            background: marker ? col : `${col}1F`,
            color: marker ? '#fff' : col,
            boxShadow: isRunning ? `0 0 0 3px ${col}22` : 'none',
          }}
        >
          {isRunning ? (
            <Loader2 className="w-[13px] h-[13px] animate-spin" />
          ) : e.status === 'ok' && marker && e.kind !== 'run_start' ? (
            <Check className="w-[13px] h-[13px]" />
          ) : (
            <Icon className="w-[13px] h-[13px]" />
          )}
        </span>

        <span
          className="font-bold text-[12.5px] text-[var(--color-ink)] truncate"
          style={{
            fontFamily:
              e.kind === 'tool_call' ? 'var(--font-mono)' : 'inherit',
          }}
        >
          {e.label || e.kind}
        </span>

        <span className="font-mono text-[10.5px] text-[var(--color-muted-2)] truncate">
          {e.agent_id}
        </span>

        {hasChildren && (
          <span className="text-[10px] text-[var(--color-muted-3)]">
            · {node.childIds.length}
          </span>
        )}

        {isError && (
          <span
            className="ml-auto font-mono text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--color-status-error)' }}
          >
            error
          </span>
        )}
      </button>
    </li>
  )
}
