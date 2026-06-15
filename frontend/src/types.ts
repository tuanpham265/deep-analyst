export type UIEventKind =
  | 'run_start'
  | 'agent_start'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'subagent_spawn'
  | 'subagent_finish'
  | 'ask_user'
  | 'user_answer'
  | 'artifact'
  | 'agent_finish'
  | 'run_finish'
  | 'error'

export type UIEventStatus = 'pending' | 'running' | 'ok' | 'error'

export interface UIEvent {
  id: string
  run_id: string
  ts: string
  parent_id: string | null
  agent_id: string
  kind: UIEventKind
  status: UIEventStatus | null
  label: string
  payload: Record<string, unknown>
}
