import { useRunStore } from '../store'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
}

export function ChatInput({ value, onChange, onSubmit }: Props) {
  const status = useRunStore((s) => s.status)
  const disabled = status === 'starting' || status === 'running'

  return (
    <div className="flex flex-col gap-2">
      <textarea
        className="bg-[var(--color-panel)] border border-[var(--color-border)] rounded-md p-2 text-sm text-[var(--color-text-bright)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-accent)] resize-none"
        rows={3}
        placeholder="e.g. What are the recent breakthroughs in fusion energy from 2024-2025?"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSubmit()
          }
        }}
        disabled={disabled}
      />
      <button
        type="button"
        className="bg-[var(--color-accent)] text-black font-medium rounded-md px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        onClick={onSubmit}
        disabled={disabled}
      >
        {disabled ? 'Running…' : 'Run research'}
      </button>
      <span className="text-[10px] text-[var(--color-text-dim)]">
        ⌘/Ctrl + Enter to submit
      </span>
    </div>
  )
}
