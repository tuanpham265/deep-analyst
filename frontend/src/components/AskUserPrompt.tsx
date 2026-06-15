import { useEffect, useState } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { sendAnswer } from '../api'
import { useRunStore } from '../store'

export function AskUserPrompt() {
  const ask = useRunStore((s) => s.pendingAsk)
  const runId = useRunStore((s) => s.runId)
  const clearAsk = useRunStore((s) => s.clearAsk)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setAnswer('')
  }, [ask?.id])

  if (!ask || !runId) return null

  async function submit() {
    if (!ask || !runId) return
    if (!answer.trim()) return
    setBusy(true)
    try {
      await sendAnswer(runId, answer.trim())
      clearAsk()
    } finally {
      setBusy(false)
    }
  }

  const question = String(ask.payload['question'] ?? ask.label)

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-lg max-w-lg w-full p-5 shadow-2xl">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircleQuestion className="w-5 h-5 text-[var(--color-accent)]" />
          <h3 className="text-[var(--color-text-bright)] text-base font-medium">
            The agent needs your input
          </h3>
        </div>
        <p className="text-sm text-[var(--color-text)] mb-4 leading-relaxed">{question}</p>
        <textarea
          autoFocus
          className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md p-2 text-sm text-[var(--color-text-bright)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
          rows={3}
          placeholder="Your answer…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void submit()
            }
          }}
          disabled={busy}
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            className="px-3 py-1.5 text-sm text-[var(--color-text-dim)] hover:text-[var(--color-text-bright)]"
            onClick={clearAsk}
            disabled={busy}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm bg-[var(--color-accent)] text-black font-medium rounded-md hover:opacity-90 disabled:opacity-40"
            onClick={submit}
            disabled={busy || !answer.trim()}
          >
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}
