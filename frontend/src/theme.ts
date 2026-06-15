import type { UIEvent, UIEventKind, UIEventStatus } from './types'

/** Per-agent accent color. Falls back to orchestrator blue for unknown agents. */
export function agentColor(agentId: string): string {
  if (agentId === 'orchestrator') return 'var(--color-orchestrator)'
  if (agentId === 'analyst') return 'var(--color-analyst)'
  if (agentId === 'writer') return 'var(--color-writer)'
  if (agentId.startsWith('researcher_1')) return 'var(--color-researcher-1)'
  if (agentId.startsWith('researcher_2')) return 'var(--color-researcher-2)'
  if (agentId.startsWith('researcher_3')) return 'var(--color-researcher-3)'
  if (agentId.startsWith('researcher')) return 'var(--color-researcher-1)'
  return 'var(--color-orchestrator)'
}

export function agentLabel(agentId: string): string {
  if (agentId === 'orchestrator') return 'Orchestrator'
  if (agentId === 'analyst') return 'Analyst'
  if (agentId === 'writer') return 'Writer'
  const m = /^researcher_(\d+)$/.exec(agentId)
  if (m) return `Researcher ${m[1]}`
  return agentId
}

export function statusColor(status: UIEventStatus | null | undefined): string {
  switch (status) {
    case 'running':
      return 'var(--color-status-running)'
    case 'ok':
      return 'var(--color-status-ok)'
    case 'error':
      return 'var(--color-status-error)'
    default:
      return 'var(--color-status-pending)'
  }
}

export const MARKER_KINDS: UIEventKind[] = [
  'run_start',
  'subagent_spawn',
  'agent_start',
  'agent_finish',
  'subagent_finish',
  'run_finish',
]

export function isMarker(e: UIEvent): boolean {
  return (MARKER_KINDS as readonly string[]).includes(e.kind)
}

export interface StageProgress {
  name: string
  detail: string
  state: 'pending' | 'active' | 'done' | 'error'
  color: string
  icon: 'spark' | 'branch' | 'sliders' | 'doc'
}

/**
 * Compute the 4-stage pipeline progress (Plan → Research → Analyze → Write)
 * from the flat list of UI events.
 */
export function pipelineProgress(events: UIEvent[]): StageProgress[] {
  const has = (predicate: (e: UIEvent) => boolean) => events.some(predicate)
  const runFinished = events.some((e) => e.kind === 'run_finish')

  const planActive = has((e) => e.kind === 'thinking' && e.agent_id === 'orchestrator')
  const planDone = has((e) => e.kind === 'subagent_spawn')

  const researchersDone = new Set(
    events
      .filter(
        (e) =>
          e.kind === 'agent_finish' && e.agent_id.startsWith('researcher'),
      )
      .map((e) => e.agent_id),
  )
  const subagentFinished = has((e) => e.kind === 'subagent_finish')
  const researchActive = planDone && !subagentFinished
  const researchDone = subagentFinished

  const analystStarted = has(
    (e) => e.kind === 'agent_start' && e.agent_id === 'analyst',
  )
  const analystFinished = has(
    (e) => e.kind === 'agent_finish' && e.agent_id === 'analyst',
  )
  const analyzeActive = analystStarted && !analystFinished
  const analyzeDone = analystFinished

  const writerStarted = has(
    (e) => e.kind === 'agent_start' && e.agent_id === 'writer',
  )
  const writerArtifact = has((e) => e.kind === 'artifact')
  const writeActive = writerStarted && !runFinished
  const writeDone = runFinished || writerArtifact

  const stateOf = (active: boolean, done: boolean): StageProgress['state'] => {
    if (done) return 'done'
    if (active) return 'active'
    return 'pending'
  }

  return [
    {
      name: 'Plan',
      detail: planDone ? 'decomposed' : planActive ? 'decomposing…' : 'awaiting',
      state: stateOf(planActive, planDone),
      color: 'var(--color-orchestrator)',
      icon: 'spark',
    },
    {
      name: 'Research',
      detail: `${researchersDone.size}/3 agents`,
      state: stateOf(researchActive, researchDone),
      color: 'var(--color-researcher-1)',
      icon: 'branch',
    },
    {
      name: 'Analyze',
      detail: analyzeDone ? 'synthesized' : analyzeActive ? 'synthesizing…' : 'awaiting',
      state: stateOf(analyzeActive, analyzeDone),
      color: 'var(--color-analyst)',
      icon: 'sliders',
    },
    {
      name: 'Write',
      detail: writeDone ? 'report.md' : writeActive ? 'drafting…' : 'awaiting',
      state: stateOf(writeActive, writeDone),
      color: 'var(--color-writer)',
      icon: 'doc',
    },
  ]
}

export const EXAMPLE_QUESTIONS = [
  'Recent breakthroughs in fusion energy (2024–2025)',
  'State of solid-state batteries in 2025',
  'How are LLM agents being evaluated?',
]
