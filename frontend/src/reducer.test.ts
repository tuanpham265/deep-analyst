import { describe, it, expect } from 'vitest'
import { applyEvent, applyEvents, emptyTree, flatten } from './reducer'
import type { UIEvent } from './types'

function ev(partial: Partial<UIEvent> & { id: string; kind: UIEvent['kind'] }): UIEvent {
  return {
    id: partial.id,
    run_id: partial.run_id ?? 'r1',
    ts: partial.ts ?? '2026-01-01T00:00:00Z',
    parent_id: partial.parent_id ?? null,
    agent_id: partial.agent_id ?? 'orchestrator',
    kind: partial.kind,
    status: partial.status ?? null,
    label: partial.label ?? partial.kind,
    payload: partial.payload ?? {},
  }
}

describe('reducer', () => {
  it('adds the first event as a root', () => {
    const t = applyEvent(emptyTree(), ev({ id: 'a', kind: 'run_start' }))
    expect(t.rootIds).toEqual(['a'])
    expect(t.byId['a'].depth).toBe(0)
  })

  it('links a child to its parent', () => {
    let t = applyEvent(emptyTree(), ev({ id: 'a', kind: 'subagent_spawn' }))
    t = applyEvent(t, ev({ id: 'b', kind: 'agent_start', parent_id: 'a' }))
    expect(t.byId['a'].childIds).toEqual(['b'])
    expect(t.byId['b'].depth).toBe(1)
    expect(t.rootIds).toEqual(['a'])
  })

  it('keeps an orphan as a root when the parent is unknown', () => {
    const t = applyEvent(emptyTree(), ev({ id: 'b', kind: 'tool_result', parent_id: 'missing' }))
    expect(t.rootIds).toEqual(['b'])
  })

  it('propagates tool_result status onto its tool_call parent', () => {
    let t = applyEvent(emptyTree(), ev({ id: 'call', kind: 'tool_call', status: 'running' }))
    t = applyEvent(t, ev({ id: 'res', kind: 'tool_result', parent_id: 'call', status: 'ok' }))
    expect(t.byId['call'].event.status).toBe('ok')
  })

  it('propagates error status from an error event onto its tool_call parent', () => {
    let t = applyEvent(emptyTree(), ev({ id: 'call', kind: 'tool_call', status: 'running' }))
    t = applyEvent(t, ev({ id: 'err', kind: 'error', parent_id: 'call', status: 'error' }))
    expect(t.byId['call'].event.status).toBe('error')
  })

  it('renders parallel siblings under one parent in insertion order', () => {
    const events = [
      ev({ id: 'spawn', kind: 'subagent_spawn' }),
      ev({ id: 'r1', kind: 'agent_start', parent_id: 'spawn', agent_id: 'researcher_1' }),
      ev({ id: 'r2', kind: 'agent_start', parent_id: 'spawn', agent_id: 'researcher_2' }),
      ev({ id: 'r3', kind: 'agent_start', parent_id: 'spawn', agent_id: 'researcher_3' }),
    ]
    const t = applyEvents(emptyTree(), events)
    expect(t.byId['spawn'].childIds).toEqual(['r1', 'r2', 'r3'])
    expect(t.byId['r1'].depth).toBe(1)
    expect(t.byId['r2'].depth).toBe(1)
    expect(t.byId['r3'].depth).toBe(1)
  })

  it('flatten produces a DFS order', () => {
    const events = [
      ev({ id: 'a', kind: 'run_start' }),
      ev({ id: 'b', kind: 'agent_start', parent_id: 'a' }),
      ev({ id: 'c', kind: 'tool_call', parent_id: 'b' }),
      ev({ id: 'd', kind: 'tool_result', parent_id: 'c' }),
      ev({ id: 'e', kind: 'agent_start', parent_id: 'a' }),
    ]
    const t = applyEvents(emptyTree(), events)
    const ids = flatten(t).map((n) => n.id)
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('is pure — does not mutate prior tree', () => {
    const t0 = emptyTree()
    const t1 = applyEvent(t0, ev({ id: 'a', kind: 'run_start' }))
    expect(t0.rootIds).toEqual([])
    expect(t1.rootIds).toEqual(['a'])
  })

  it('orphan event becoming a root does not break later linking', () => {
    let t = applyEvent(emptyTree(), ev({ id: 'orphan', kind: 'tool_result', parent_id: 'gone' }))
    t = applyEvent(t, ev({ id: 'root', kind: 'run_start' }))
    expect(t.rootIds).toEqual(['orphan', 'root'])
  })
})
