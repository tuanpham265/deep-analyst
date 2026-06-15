import { X } from 'lucide-react'
import { useRunStore } from '../store'
import { agentColor, statusColor } from '../theme'

export function NodeDetail() {
  const selectedId = useRunStore((s) => s.selectedNodeId)
  const tree = useRunStore((s) => s.tree)
  const setSelected = useRunStore((s) => s.setSelected)

  if (!selectedId) return null
  const node = tree.byId[selectedId]
  if (!node) return null
  const e = node.event
  const col = agentColor(e.agent_id)
  const stCol = statusColor(e.status)

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-4 flex items-start gap-2.5 justify-between border-b border-[var(--color-border-soft)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center flex-shrink-0"
            style={{ background: col }}
          />
          <div className="min-w-0">
            <div className="text-[9.5px] font-bold tracking-wider uppercase text-[var(--color-muted-2)]">
              {e.kind.replace(/_/g, ' ')}
            </div>
            <div className="text-[14px] font-bold text-[var(--color-ink)] leading-[1.2] truncate">
              {e.label}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="text-[var(--color-muted-2)] hover:text-[var(--color-ink)] flex-shrink-0"
          onClick={() => setSelected(null)}
          aria-label="Close detail"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-px bg-[var(--color-border-soft)] border border-[var(--color-border-soft)] rounded-[10px] overflow-hidden mb-4">
          <FactRow label="agent" mono>
            {e.agent_id}
          </FactRow>
          <FactRow label="status">
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold"
              style={{ color: stCol }}
            >
              <span
                className="w-[7px] h-[7px] rounded-full"
                style={{ background: stCol }}
              />
              {e.status ?? 'pending'}
            </span>
          </FactRow>
          <FactRow label="timestamp" mono>
            {e.ts}
          </FactRow>
          <FactRow label="parent" mono>
            {e.parent_id ?? '—'}
          </FactRow>
          <FactRow label="id" mono>
            {e.id}
          </FactRow>
        </div>

        <div className="text-[9.5px] font-bold tracking-wider uppercase text-[var(--color-muted-2)] mb-1.5">
          payload
        </div>
        <pre className="m-0 font-mono text-[11.5px] leading-[1.65] text-[var(--color-ink-2)] bg-[var(--color-card-2)] border border-[var(--color-border-soft)] rounded-[10px] p-3 whitespace-pre-wrap break-words">
          {JSON.stringify(e.payload, null, 2)}
        </pre>
      </div>
    </div>
  )
}

function FactRow({
  label,
  mono,
  children,
}: {
  label: string
  mono?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex justify-between gap-2.5 px-3 py-2.5 bg-white items-center">
      <span className="text-[11px] text-[var(--color-muted-2)] font-semibold">
        {label}
      </span>
      <span
        className={`text-[11.5px] text-[var(--color-ink)] ${
          mono ? 'font-mono' : ''
        } truncate text-right`}
      >
        {children}
      </span>
    </div>
  )
}
