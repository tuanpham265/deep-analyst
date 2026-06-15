import { Check, FileText, GitBranch, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useRunStore } from '../store'
import { pipelineProgress, type StageProgress } from '../theme'

const ICON_MAP = {
  spark: Sparkles,
  branch: GitBranch,
  sliders: SlidersHorizontal,
  doc: FileText,
} as const

export function PipelineRow() {
  const events = useRunStore((s) => s.events)
  const question = useRunStore((s) => s.question)
  const stages = pipelineProgress(events)

  return (
    <div
      className="flex-shrink-0 flex items-center gap-4 px-4 py-2 border-b border-[var(--color-border)]"
      style={{
        background: 'rgba(255,255,255,.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="min-w-[120px] max-w-[300px] flex-shrink-0">
        <div className="text-[9px] font-bold tracking-wider text-[var(--color-muted-2)] uppercase">
          Research question
        </div>
        <div
          className="text-[13px] font-bold text-[var(--color-ink)] whitespace-nowrap overflow-hidden text-ellipsis"
          title={question ?? ''}
        >
          {question ?? '—'}
        </div>
      </div>

      <div className="flex-1 flex justify-end min-w-0 overflow-hidden">
        <div className="flex items-center gap-1 overflow-hidden">
          {stages.map((s, i) => (
            <div key={s.name} className="flex items-center gap-1">
              <Stage stage={s} />
              {i < stages.length - 1 && (
                <div
                  className="w-[18px] h-[2px] rounded-full flex-shrink-0"
                  style={{
                    background:
                      s.state === 'done' ? s.color : 'var(--color-border)',
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stage({ stage }: { stage: StageProgress }) {
  const Icon = ICON_MAP[stage.icon]
  const on = stage.state === 'done' || stage.state === 'active'
  const isActive = stage.state === 'active'
  const isDone = stage.state === 'done'

  return (
    <div
      className="flex items-center gap-2 pr-3 pl-1.5 py-1 rounded-full"
      style={{
        background: isActive ? `${stage.color}14` : 'transparent',
        border: isActive
          ? `1px solid ${stage.color}40`
          : '1px solid transparent',
      }}
    >
      <div
        className={`w-[26px] h-[26px] rounded-[8px] flex-shrink-0 flex items-center justify-center ${
          isActive ? 'animate-pulse-soft' : ''
        }`}
        style={{
          background: on ? stage.color : 'white',
          border: on ? 'none' : '1.5px solid var(--color-muted-4)',
          color: on ? 'white' : 'var(--color-muted-4)',
          boxShadow: isActive ? `0 0 0 3px ${stage.color}22` : 'none',
        }}
      >
        {isDone ? <Check className="w-[14px] h-[14px]" /> : <Icon className="w-[14px] h-[14px]" />}
      </div>
      <div className="leading-[1.12]">
        <div
          className="text-[12px] font-bold whitespace-nowrap"
          style={{ color: on ? 'var(--color-ink)' : 'var(--color-muted-2)' }}
        >
          {stage.name}
        </div>
        <div
          className="text-[9.5px] whitespace-nowrap"
          style={{
            color: isActive ? stage.color : 'var(--color-muted-2)',
            fontWeight: isActive ? 700 : 500,
          }}
        >
          {stage.detail}
        </div>
      </div>
    </div>
  )
}
