import { useState } from 'react'
import { Sparkles, GitBranch, SlidersHorizontal, FileText } from 'lucide-react'
import { EXAMPLE_QUESTIONS } from '../theme'

interface Props {
  onSubmit: (question: string) => void
  disabled?: boolean
}

const PIPELINE_STAGES = [
  { name: 'Plan', color: '#0A84FF', Icon: Sparkles },
  { name: 'Research ×3', color: '#06B6D4', Icon: GitBranch },
  { name: 'Analyze', color: '#8B5CF6', Icon: SlidersHorizontal },
  { name: 'Write', color: '#10B981', Icon: FileText },
]

export function Landing({ onSubmit, disabled }: Props) {
  const [question, setQuestion] = useState('')

  function submit(text?: string) {
    const q = (text ?? question).trim()
    if (!q || disabled) return
    onSubmit(q)
  }

  return (
    <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
      <div className="w-full max-w-[760px] flex flex-col items-center">
        <div className="flex items-center gap-2 text-[11.5px] font-bold tracking-wider text-[var(--color-accent)] bg-white border border-[var(--color-border)] px-3 py-1.5 rounded-full shadow-sm mb-5">
          <span
            className="w-[7px] h-[7px] rounded-full"
            style={{ background: 'linear-gradient(135deg, #0A84FF, #22D3EE)' }}
          />
          Research intelligence, fully traced
        </div>

        <h1 className="m-0 mb-2.5 text-[38px] font-extrabold tracking-tight text-center text-[var(--color-ink)] leading-[1.06]">
          What should we research?
        </h1>
        <p className="m-0 mb-6 text-[15.5px] text-[var(--color-muted)] text-center max-w-[540px] leading-[1.5]">
          Deep Analyst decomposes your question, dispatches three web researchers
          in parallel, then runs an analyst and a writer — every step streamed
          into a live trace.
        </p>

        <div className="w-full bg-white border border-[var(--color-border)] rounded-[18px] p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04),0_20px_44px_-26px_rgba(15,23,42,.28)]">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder="e.g. What are the recent breakthroughs in fusion energy from 2024–2025?"
            rows={3}
            disabled={disabled}
            className="w-full border-0 outline-0 resize-none text-base leading-[1.55] text-[var(--color-ink)] bg-transparent p-2 pb-1"
          />
          <div className="flex items-center justify-between px-1 pt-1.5">
            <span className="font-mono text-[11px] text-[var(--color-muted-2)]">
              ⌘ ↵ to run
            </span>
            <button
              type="button"
              onClick={() => submit()}
              disabled={disabled || !question.trim()}
              className="font-sans text-sm font-bold text-white border-0 px-5 py-[11px] rounded-[11px] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                background: 'linear-gradient(135deg, #0A84FF, #22B8E8)',
                boxShadow: '0 6px 16px -6px rgba(10,132,255,.6)',
              }}
            >
              Run analysis →
            </button>
          </div>
        </div>

        <div className="flex gap-2.5 flex-wrap justify-center mt-4">
          {EXAMPLE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              disabled={disabled}
              className="font-sans text-[12.5px] font-semibold text-[var(--color-ink-3)] bg-white border border-[var(--color-border)] px-3 py-2 rounded-full cursor-pointer shadow-sm hover:bg-[var(--color-card-2)] disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="flex items-center mt-8 py-3.5 px-2 w-full justify-center">
          {PIPELINE_STAGES.map((s, i) => (
            <div key={s.name} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className="w-[42px] h-[42px] rounded-xl bg-white border border-[var(--color-border)] flex items-center justify-center shadow-[0_2px_8px_-3px_rgba(15,23,42,.12)]"
                  style={{ color: s.color }}
                >
                  <s.Icon className="w-[19px] h-[19px]" />
                </div>
                <span className="text-[11.5px] font-bold text-[var(--color-ink-3)]">
                  {s.name}
                </span>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <div
                  className="w-[34px] h-[2px] mx-1 mb-6"
                  style={{
                    background: 'linear-gradient(90deg, #D5DEEA, #E6EBF2)',
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
