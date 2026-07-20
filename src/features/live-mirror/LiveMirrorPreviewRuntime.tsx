import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { X } from 'lucide-react'
import { closeQuickPreview, isQuickPreviewWindow, previewSessionKind } from '../quick-preview/quickPreview'
import { rehypePlugins, remarkPlugins } from '../markdown/plugins'
import { LiveMirrorOverlayLegend } from './LiveMirrorOverlayLegend'
import { liveMirrorPreviewSnapshot, listenForLiveMirrorPreview, type LiveMirrorPreviewSnapshot } from './liveMirrorPreview'
import { collectLiveMirrorHeadingAnchors, headingContextAtLine } from './liveMirrorHeadingAnchors'

export interface LiveMirrorPreviewRuntimeProps {
  onError?: (message: string) => void
}

/**
 * A read-only visual shell for the transient native window. It intentionally
 * sits above the ordinary App tree because the window has its own JS runtime;
 * no main-window state is shared, persisted, or mutated.
 */
export function LiveMirrorPreviewRuntime({ onError }: LiveMirrorPreviewRuntimeProps) {
  const [snapshot, setSnapshot] = useState<LiveMirrorPreviewSnapshot | null>(null)
  const [headingContext, setHeadingContext] = useState<string | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let disposed = false
    let unlisten: () => void = () => undefined
    const report = (error: unknown) => onError?.(`Live Mirror: ${error instanceof Error ? error.message : String(error)}`)
    const load = async () => {
      const next = await liveMirrorPreviewSnapshot()
      if (!disposed) setSnapshot(next)
    }
    void (async () => {
      if (!await isQuickPreviewWindow() || await previewSessionKind() !== 'live-mirror') return
      await load()
      unlisten = await listenForLiveMirrorPreview(() => { void load().catch(report) })
    })().catch(report)
    return () => { disposed = true; unlisten() }
  }, [onError])

  useEffect(() => {
    if (!snapshot) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      event.preventDefault()
      void closeQuickPreview().catch((error) => onError?.(`Live Mirror: ${error instanceof Error ? error.message : String(error)}`))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onError, snapshot])

  if (!snapshot) return null
  const sourceLineCount = Math.max(1, snapshot.markdown.split(/\r?\n/).length)
  const headingAnchors = collectLiveMirrorHeadingAnchors(snapshot.markdown)
  const jumpToOverlay = (line: number) => {
    const container = contentRef.current
    if (!container) return
    const context = headingContextAtLine(headingAnchors, line)
    if (context) {
      setHeadingContext(context.text)
      // `rehype-slug` owns the rendered id. We use the same slug algorithm in
      // the source model, then fall back to a proportional scroll only for
      // Markdown constructs without a rendered heading target.
      const target = container.querySelector<HTMLElement>(`[id=${JSON.stringify(context.id)}]`)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    // Markdown rendering has no guaranteed one-to-one DOM line mapping. A
    // stable source-line ratio is honest, deterministic, and works for every
    // supported block type without inventing a false DOM anchor.
    const ratio = Math.max(0, Math.min(1, (line - 1) / Math.max(1, sourceLineCount - 1)))
    container.scrollTo({ top: (container.scrollHeight - container.clientHeight) * ratio, behavior: 'smooth' })
  }

  return <section className="fixed inset-0 z-[100] flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)]" aria-label="Live Mirror temporary reader">
    <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--paper)] px-4 py-2 shadow-sm">
      <div className="min-w-0 flex-1"><strong className="block truncate">Live Mirror · {snapshot.title}</strong><span className="text-xs text-[var(--text-muted)]">{headingContext ? `Chapter: ${headingContext} · ` : ''}Read-only temporary snapshot · Esc closes without affecting the main reader</span></div>
      <button type="button" onClick={() => void closeQuickPreview()} className="rounded p-2 hover:bg-[var(--hover)]" aria-label="Close Live Mirror"><X size={18} /></button>
    </header>
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_260px]">
      <main ref={contentRef} className="relative overflow-y-auto px-8 py-10" aria-label="Live Mirror document snapshot">
        <article className="prose mx-auto max-w-[920px]"><ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>{snapshot.markdown}</ReactMarkdown></article>
      </main>
      <aside className="overflow-y-auto border-l border-[var(--border)] bg-[var(--paper)] p-3">
        <p className="mb-3 text-xs text-[var(--text-muted)]">Overlay snapshot: {snapshot.overlays.length}</p>
        <LiveMirrorOverlayLegend overlays={snapshot.overlays.map((overlay) => ({ ...overlay, start: 0, end: 0 }))} onNavigate={(overlay) => jumpToOverlay(overlay.line)} />
      </aside>
    </div>
  </section>
}
