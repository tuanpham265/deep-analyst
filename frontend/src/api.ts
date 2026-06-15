export interface StartRunResponse {
  run_id: string
  mode: 'real' | 'demo'
}

export async function startRun(question: string): Promise<StartRunResponse> {
  const res = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
  if (!res.ok) throw new Error(`startRun failed: ${res.status}`)
  return res.json()
}

export async function sendAnswer(runId: string, answer: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  })
  if (!res.ok) throw new Error(`sendAnswer failed: ${res.status}`)
}

export async function cancelRun(runId: string): Promise<void> {
  const res = await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' })
  if (!res.ok) throw new Error(`cancelRun failed: ${res.status}`)
}

export interface ArtifactDetail {
  name: string
  mime: string
  content: string
}

export async function fetchArtifact(runId: string, name: string): Promise<ArtifactDetail> {
  const res = await fetch(`/api/runs/${runId}/artifacts/${encodeURIComponent(name)}`)
  if (!res.ok) throw new Error(`fetchArtifact failed: ${res.status}`)
  return res.json()
}

export function wsUrl(runId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/${runId}`
}
