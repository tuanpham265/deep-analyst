import { useEffect, useState } from 'react'
import { Code2, Eye, FileText, Maximize2, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchArtifact } from '../api'
import { useRunStore } from '../store'

export function ArtifactsPanel() {
  const runId = useRunStore((s) => s.runId)
  const artifacts = useRunStore((s) => s.artifacts)
  const names = Object.keys(artifacts)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'rendered' | 'source'>('rendered')
  const [fullscreen, setFullscreen] = useState(false)

  // ESC to exit full-screen
  useEffect(() => {
    if (!fullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  useEffect(() => {
    if (names.length > 0 && !selected) setSelected(names[0])
  }, [names, selected])

  useEffect(() => {
    if (!runId || !selected) return
    setLoading(true)
    fetchArtifact(runId, selected)
      .then((a) => setContent(a.content))
      .catch((e) => setContent(`(failed to load: ${String(e)})`))
      .finally(() => setLoading(false))
  }, [runId, selected])

  if (names.length === 0) {
    return (
      <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center p-8 gap-3 bg-white">
        <span
          className="w-[46px] h-[46px] rounded-[13px] flex items-center justify-center"
          style={{ background: '#F1F5F9', color: 'var(--color-muted-2)' }}
        >
          <FileText className="w-5 h-5" />
        </span>
        <div className="text-[13.5px] font-bold text-[var(--color-ink-3)]">
          No artifact yet
        </div>
        <p className="m-0 text-[12px] text-[var(--color-muted-2)] leading-[1.5] max-w-[240px]">
          The writer produces{' '}
          <span className="font-mono">research_report.md</span> at the end of
          the run. It will appear here automatically.
        </p>
      </div>
    )
  }

  const isMarkdown = selected?.toLowerCase().endsWith('.md') ?? false
  const artifact = selected ? artifacts[selected] : null

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-[var(--color-border-soft)] flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {names.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSelected(n)}
              className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${
                selected === n
                  ? 'bg-[var(--color-accent-bg)] text-[var(--color-accent)]'
                  : 'text-[var(--color-muted-2)] hover:text-[var(--color-ink)]'
              }`}
            >
              <FileText className="w-3 h-3" />
              {n}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {isMarkdown && (
            <button
              type="button"
              onClick={() => setMode(mode === 'rendered' ? 'source' : 'rendered')}
              className="flex items-center gap-1 text-[10px] text-[var(--color-muted-2)] hover:text-[var(--color-ink)] px-1.5 py-0.5 rounded border border-[var(--color-border)]"
              title={mode === 'rendered' ? 'Show raw markdown' : 'Show rendered view'}
            >
              {mode === 'rendered' ? (
                <Code2 className="w-3 h-3" />
              ) : (
                <Eye className="w-3 h-3" />
              )}
              {mode === 'rendered' ? 'Source' : 'Rendered'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            className="flex items-center gap-1 text-[10px] text-[var(--color-muted-2)] hover:text-[var(--color-ink)] px-1.5 py-0.5 rounded border border-[var(--color-border)]"
            title="Open report in full screen"
          >
            <Maximize2 className="w-3 h-3" />
            Expand
          </button>
        </div>
      </div>

      {/* Artifact header card */}
      {artifact && (
        <div
          className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--color-border-soft)]"
          style={{ background: 'linear-gradient(180deg, #F4FBF8, #fff)' }}
        >
          <span
            className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(16,185,129,0.12)',
              color: 'var(--color-status-ok)',
            }}
          >
            <FileText className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[12.5px] font-semibold text-[var(--color-ink)] truncate">
              {artifact.name}
            </div>
            <div className="text-[10.5px] text-[var(--color-muted-2)]">
              {artifact.mime} · {artifact.size} bytes · by writer
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <span className="text-[var(--color-muted-2)] text-xs">Loading…</span>
        ) : isMarkdown && mode === 'rendered' ? (
          <div className="prose-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap font-mono leading-relaxed text-[var(--color-ink-2)] text-xs">
            {content}
          </pre>
        )}
      </div>

      {fullscreen && artifact && (
        <FullscreenViewer
          name={artifact.name}
          mime={artifact.mime}
          size={artifact.size}
          content={content}
          isMarkdown={isMarkdown}
          mode={mode}
          onSetMode={setMode}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  )
}

interface FullscreenProps {
  name: string
  mime: string
  size: number
  content: string
  isMarkdown: boolean
  mode: 'rendered' | 'source'
  onSetMode: (m: 'rendered' | 'source') => void
  onClose: () => void
}

function FullscreenViewer({
  name,
  mime,
  size,
  content,
  isMarkdown,
  mode,
  onSetMode,
  onClose,
}: FullscreenProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center p-6 animate-fadeup"
      style={{ background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[920px] bg-white rounded-2xl flex flex-col overflow-hidden"
        style={{
          boxShadow: '0 30px 70px -20px rgba(15,23,42,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border-soft)]"
          style={{ background: 'linear-gradient(180deg, #F4FBF8, #fff)' }}
        >
          <span
            className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(16,185,129,0.12)',
              color: 'var(--color-status-ok)',
            }}
          >
            <FileText className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-[13.5px] font-semibold text-[var(--color-ink)] truncate">
              {name}
            </div>
            <div className="text-[11px] text-[var(--color-muted-2)]">
              {mime} · {size} bytes · by writer
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isMarkdown && (
              <button
                type="button"
                onClick={() =>
                  onSetMode(mode === 'rendered' ? 'source' : 'rendered')
                }
                className="flex items-center gap-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-ink)] px-2 py-1 rounded border border-[var(--color-border)] bg-white"
                title={
                  mode === 'rendered' ? 'Show raw markdown' : 'Show rendered view'
                }
              >
                {mode === 'rendered' ? (
                  <Code2 className="w-3 h-3" />
                ) : (
                  <Eye className="w-3 h-3" />
                )}
                {mode === 'rendered' ? 'Source' : 'Rendered'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-[var(--color-muted-2)] hover:text-[var(--color-ink)] hover:bg-[var(--color-card-2)] rounded-lg"
              aria-label="Close full-screen view"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-8 py-6">
          {isMarkdown && mode === 'rendered' ? (
            <div className="prose-md" style={{ fontSize: 15 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono leading-relaxed text-[var(--color-ink-2)] text-[13px]">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
