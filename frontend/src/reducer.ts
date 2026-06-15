import type { UIEvent } from './types'

export interface TraceNode {
  id: string
  event: UIEvent
  childIds: string[]
  depth: number
}

export interface TraceTree {
  rootIds: string[]
  byId: Record<string, TraceNode>
  /** Insertion order for stable rendering (parallel siblings preserved). */
  order: string[]
}

export function emptyTree(): TraceTree {
  return { rootIds: [], byId: {}, order: [] }
}

/**
 * Append one event to the tree. Pure: returns a new tree.
 *
 * - `parent_id` links the new node to its parent. If the parent is unknown,
 *   the node becomes a root (the tree degrades gracefully — never drops events).
 * - For `tool_result` events whose `parent_id` matches an existing `tool_call`,
 *   we mutate the parent's status to mirror the result. This collapses the
 *   "call running → result OK" pair visually without losing either node.
 */
export function applyEvent(tree: TraceTree, event: UIEvent): TraceTree {
  const byId = { ...tree.byId }
  const order = tree.order.includes(event.id) ? tree.order : [...tree.order, event.id]
  let rootIds = tree.rootIds

  const node: TraceNode = {
    id: event.id,
    event,
    childIds: [],
    depth: 0,
  }

  const parent = event.parent_id ? byId[event.parent_id] : undefined
  if (parent) {
    node.depth = parent.depth + 1
    byId[parent.id] = { ...parent, childIds: [...parent.childIds, event.id] }

    // Propagate terminal status from tool_result to its tool_call parent.
    if (
      (event.kind === 'tool_result' || event.kind === 'error') &&
      parent.event.kind === 'tool_call'
    ) {
      byId[parent.id] = {
        ...byId[parent.id],
        event: { ...parent.event, status: event.status ?? parent.event.status },
      }
    }
  } else {
    rootIds = [...rootIds, event.id]
  }

  byId[event.id] = node

  // Propagate terminal status from `*_finish` (or `error`) events back onto
  // their opening node so the tree icon mirrors actual final state instead
  // of the frozen "running" status from emit time.
  const propagateTo = (predicate: (n: TraceNode) => boolean) => {
    for (const id of Object.keys(byId)) {
      const n = byId[id]
      if (predicate(n) && n.event.status === 'running') {
        byId[id] = {
          ...n,
          event: { ...n.event, status: event.status ?? 'ok' },
        }
        return
      }
    }
  }

  if (event.kind === 'agent_finish' || event.kind === 'error') {
    propagateTo(
      (n) => n.event.kind === 'agent_start' && n.event.agent_id === event.agent_id,
    )
  }
  if (event.kind === 'run_finish') {
    propagateTo((n) => n.event.kind === 'run_start')
  }
  if (event.kind === 'subagent_finish') {
    // subagent_finish events carry parent_id = the spawn node's id
    propagateTo(
      (n) => n.event.kind === 'subagent_spawn' && n.id === event.parent_id,
    )
  }

  return { rootIds, byId, order }
}

export function applyEvents(tree: TraceTree, events: UIEvent[]): TraceTree {
  let next = tree
  for (const e of events) next = applyEvent(next, e)
  return next
}

/** Walk the tree depth-first; useful for tests and flat rendering. */
export function flatten(tree: TraceTree): TraceNode[] {
  const out: TraceNode[] = []
  const visit = (id: string) => {
    const n = tree.byId[id]
    if (!n) return
    out.push(n)
    for (const c of n.childIds) visit(c)
  }
  for (const r of tree.rootIds) visit(r)
  return out
}
