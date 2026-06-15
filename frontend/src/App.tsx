import { useEffect, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { startRun } from './api'
import { useRunStore } from './store'
import { useEventStream } from './useEventStream'
import { TraceTree } from './components/TraceTree'
import { NodeDetail } from './components/NodeDetail'
import { Header } from './components/Header'
import { PipelineRow } from './components/PipelineRow'
import { Landing } from './components/Landing'
import { ArtifactsPanel } from './components/ArtifactsPanel'
import { AskUserPrompt } from './components/AskUserPrompt'

function App() {
  const [rightTab, setRightTab] = useState<'detail' | 'artifacts'>('detail')
  const [rightOpen, setRightOpen] = useState(true)
  const runId = useRunStore((s) => s.runId)
  const setRun = useRunStore((s) => s.setRun)
  const setStatus = useRunStore((s) => s.setStatus)
  const reset = useRunStore((s) => s.reset)
  const selectedNodeId = useRunStore((s) => s.selectedNodeId)
  const artifactCount = useRunStore((s) => Object.keys(s.artifacts).length)
  const status = useRunStore((s) => s.status)
  const events = useRunStore((s) => s.events)

  const isRun = runId !== null
  const isLanding = !isRun

  useEventStream(runId)

  // Auto-switch to Artifacts tab when the writer produces its output.
  useEffect(() => {
    if (artifactCount > 0) setRightTab('artifacts')
  }, [artifactCount])

  // When a node is clicked, focus the Detail tab.
  useEffect(() => {
    if (selectedNodeId) setRightTab('detail')
  }, [selectedNodeId])

  async function onLandingSubmit(question: string) {
    reset()
    setStatus('starting')
    try {
      const { run_id, mode } = await startRun(question)
      setRun(run_id, mode, question)
    } catch (e: unknown) {
      setStatus('error', e instanceof Error ? e.message : 'unknown error')
    }
  }

  function onNewRun() {
    reset()
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header showNewRun={isRun} onNewRun={onNewRun} />

      {isLanding && <Landing onSubmit={onLandingSubmit} disabled={status === 'starting'} />}

      {isRun && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <PipelineRow />

          <div className="flex-1 flex gap-3 p-3 overflow-hidden min-h-0">
            <section
              className="flex-1 min-w-0 bg-white border border-[var(--color-border)] rounded-2xl flex flex-col overflow-hidden"
              style={{
                boxShadow:
                  '0 1px 2px rgba(15,23,42,.04), 0 12px 28px -20px rgba(15,23,42,.2)',
              }}
            >
              <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 border-b border-[var(--color-border-soft)] flex-shrink-0">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-extrabold tracking-tight text-[var(--color-ink)] whitespace-nowrap">
                    Execution trace
                  </div>
                  <div className="text-[10.5px] text-[var(--color-muted-2)] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                    6 agents · {events.length} steps streamed
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setRightOpen((v) => !v)}
                  title={rightOpen ? 'Hide inspector' : 'Show inspector'}
                  className="w-[30px] h-[30px] flex items-center justify-center border border-[var(--color-border)] bg-white rounded-lg cursor-pointer text-[var(--color-muted-2)] flex-shrink-0 hover:text-[var(--color-ink)]"
                >
                  {rightOpen ? (
                    <PanelRightClose className="w-4 h-4" />
                  ) : (
                    <PanelRightOpen className="w-4 h-4" />
                  )}
                </button>
              </div>
              <div className="flex-1 min-h-0 relative">
                <TraceTree />
              </div>
            </section>

            {rightOpen && (
              <aside
                className="w-[340px] flex-shrink-0 bg-white border border-[var(--color-border)] rounded-2xl flex flex-col overflow-hidden"
                style={{
                  boxShadow:
                    '0 1px 2px rgba(15,23,42,.04), 0 12px 28px -20px rgba(15,23,42,.2)',
                }}
              >
                <div className="flex-shrink-0 border-b border-[var(--color-border-soft)] px-1.5">
                  <div className="flex gap-1">
                    <TabButton
                      active={rightTab === 'detail'}
                      onClick={() => setRightTab('detail')}
                      label="Detail"
                    />
                    <TabButton
                      active={rightTab === 'artifacts'}
                      onClick={() => setRightTab('artifacts')}
                      label={artifactCount > 0 ? `Artifacts (${artifactCount})` : 'Artifacts'}
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-auto">
                  {rightTab === 'detail' ? (
                    selectedNodeId ? (
                      <NodeDetail />
                    ) : (
                      <NoSelectionHelp />
                    )
                  ) : (
                    <ArtifactsPanel />
                  )}
                </div>
              </aside>
            )}
          </div>
        </div>
      )}

      <AskUserPrompt />
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-sans text-[12.5px] font-bold border-0 cursor-pointer bg-transparent px-3 py-3 -mb-px"
      style={{
        borderBottom: active
          ? '2px solid var(--color-accent)'
          : '2px solid transparent',
        color: active ? 'var(--color-ink)' : 'var(--color-muted-2)',
      }}
    >
      {label}
    </button>
  )
}

function NoSelectionHelp() {
  return (
    <div className="p-4">
      <div className="text-[13px] font-semibold text-[var(--color-ink-3)] mb-1.5">
        Select any step to inspect it
      </div>
      <p className="m-0 mb-4 text-[12px] text-[var(--color-muted-2)] leading-[1.5]">
        Every node is one typed{' '}
        <span className="font-mono text-[var(--color-accent)]">UIEvent</span>{' '}
        — the single contract between the agent backend and this UI.
      </p>
      <div className="text-[9.5px] font-bold tracking-wider uppercase text-[var(--color-muted-2)] mb-2.5">
        Event legend
      </div>
      <Legend />
    </div>
  )
}

const LEGEND: Array<{ kind: string; label: string; color: string }> = [
  { kind: 'run_start', label: 'Run start', color: 'var(--color-orchestrator)' },
  { kind: 'thinking', label: 'Thinking', color: 'var(--color-analyst)' },
  { kind: 'tool_call', label: 'Tool call', color: 'var(--color-researcher-1)' },
  { kind: 'subagent_spawn', label: 'Spawn', color: 'var(--color-orchestrator)' },
  { kind: 'agent_finish', label: 'Finish', color: 'var(--color-writer)' },
  { kind: 'artifact', label: 'Artifact', color: 'var(--color-writer)' },
  { kind: 'error', label: 'Error', color: 'var(--color-status-error)' },
]

function Legend() {
  return (
    <div className="flex flex-col gap-1.5">
      {LEGEND.map(({ kind, label, color }) => (
        <div key={kind} className="flex items-center gap-2">
          <span
            className="w-[24px] h-[24px] rounded-[7px] flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}26`, color }}
          />
          <span className="text-[12.5px] text-[var(--color-ink-3)] font-semibold">
            {label}
          </span>
          <span className="ml-auto font-mono text-[10.5px] text-[var(--color-muted-3)]">
            {kind}
          </span>
        </div>
      ))}
    </div>
  )
}

export default App
