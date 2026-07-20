import type { Annotation, DocumentAnnotations, Excerpt } from '../../types'
import type { AnnotationRenderStatus } from '../../features/annotations/annotationRendering'
import { ExcerptTray } from './ExcerptTray'

interface AnnotationTrayProps {
  data: DocumentAnnotations
  open: boolean
  onToggle: () => void
  onRemoveAnnotation: (id: string) => void
  onRemoveExcerpt: (id: string) => void
  onReorderExcerpts?: (activeId: string, targetId: string) => void
  onExport: () => void
  onExportDocx?: () => void
  /** Host-owned stable-anchor navigation; the tray itself never mutates Markdown. */
  onNavigateExcerpt?: (excerpt: Excerpt) => void
  onNavigateAnnotation?: (annotation: Annotation) => void
  annotationStatuses?: Readonly<Record<string, AnnotationRenderStatus>>
  /** Offered only when portable sidecar storage is available but has not been created yet. */
  onMigrateToSidecar?: () => void
}

export function AnnotationTray({ data, open, onToggle, onRemoveAnnotation, onRemoveExcerpt, onReorderExcerpts, onExport, onExportDocx, onNavigateExcerpt, onNavigateAnnotation, annotationStatuses = {}, onMigrateToSidecar }: AnnotationTrayProps) {
  const count = data.annotations.length + data.excerpts.length
  if (!open) return null
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--paper)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 text-left text-sm font-medium hover:text-[var(--accent)]">批注与摘录 <span className="text-xs text-[var(--text-muted)]">({count})</span></button>
        {open && <span className="flex items-center gap-1"><button type="button" onClick={onExport} className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--hover)]">导出 Markdown</button>{onExportDocx && <button type="button" onClick={onExportDocx} className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--hover)]">导出审阅 DOCX</button>}{onMigrateToSidecar && <button type="button" onClick={onMigrateToSidecar} className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--hover)]">迁移为随身批注</button>}</span>}
      </div>
      {open && <div className="max-h-[calc(min(70vh,560px)-44px)] overflow-y-auto p-3 text-sm">
        {onMigrateToSidecar && <p className="mb-3 rounded border border-[var(--border)] bg-[var(--hover)] p-2 text-xs text-[var(--text-secondary)]">当前批注仅保存在本机。可迁移为与文档同目录的 <code>.mdreader.json</code>，方便随文件携带；不会修改 Markdown 原文。</p>}
        {!count && <p className="text-[var(--text-muted)]">选中阅读内容后，可添加高亮批注或摘录。所有数据仅保存在本机 sidecar 存储中。</p>}
        {!!data.excerpts.length && <section className="mb-4"><h2 className="mb-2 text-xs font-semibold text-[var(--text-muted)]">摘录</h2><ExcerptTray excerpts={data.excerpts} documentLabel={data.documentKey.split(/[\\/]/).pop() || '当前文档'} onRemove={onRemoveExcerpt} onReorder={onReorderExcerpts} onNavigate={onNavigateExcerpt} /></section>}
        {!!data.annotations.length && <section><h2 className="mb-2 text-xs font-semibold text-[var(--text-muted)]">批注</h2><ul className="space-y-2">{data.annotations.map((annotation) => <li key={annotation.id} className="rounded border border-[var(--border)] p-2"><p className="m-0 font-medium">{annotation.anchor.quote}</p>{annotation.note && <p className="mb-0 mt-1 text-[var(--text-secondary)]">{annotation.note}</p>}{annotationStatuses[annotation.id] === 'unavailable' && <p role="status" className="mb-0 mt-1 text-xs text-[var(--text-muted)]">原文位置未找到；批注已安全保留，未改写文档。</p>}<div className="mt-2 flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]"><span>{annotation.kind} · {annotation.anchor.headingPath.join(' › ') || '文档正文'}</span><span className="flex gap-2">{onNavigateAnnotation && annotationStatuses[annotation.id] !== 'unavailable' && <button type="button" onClick={() => onNavigateAnnotation(annotation)} className="hover:text-[var(--accent)]">回到原文</button>}<button type="button" onClick={() => onRemoveAnnotation(annotation.id)} className="hover:text-red-600">删除</button></span></div></li>)}</ul></section>}
      </div>}
    </section>
  )
}
