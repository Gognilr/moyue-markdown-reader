import { useEffect, useState } from 'react'
import type { Annotation, AnnotationKind, DocumentAnnotations, TextAnchor } from '../../types'
import { addAnnotation, removeAnnotation, updateAnnotationNote } from '../../features/annotations/annotationActions'

export interface AnnotationWorkbenchProps {
  /** Controlled data allows a native sidecar or localStorage repository to own persistence. */
  data: DocumentAnnotations
  /** The caller may pass a just-selected stable anchor to enable creation controls. */
  selectedAnchor?: TextAnchor | null
  onChange: (next: DocumentAnnotations) => void
  className?: string
}

const annotationLabels: Record<AnnotationKind, string> = {
  highlight: '高亮',
  underline: '下划线',
  bookmark: '书签',
  note: '备注',
}

function AnnotationCard({ annotation, onSave, onRemove }: { annotation: Annotation; onSave: (note: string) => void; onRemove: () => void }) {
  const [note, setNote] = useState(annotation.note ?? '')
  useEffect(() => setNote(annotation.note ?? ''), [annotation.id, annotation.note])
  return <li className="rounded border border-[var(--border)] p-2">
    <div className="flex items-start justify-between gap-2">
      <div><span className="mr-2 rounded bg-[var(--hover)] px-1.5 py-0.5 text-xs">{annotationLabels[annotation.kind]}</span><span className="font-medium">{annotation.anchor.quote}</span></div>
      <button type="button" onClick={onRemove} className="shrink-0 text-xs hover:text-red-600">删除</button>
    </div>
    <label className="mt-2 block text-xs text-[var(--text-muted)]">备注
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 block w-full rounded border border-[var(--border)] bg-transparent p-1.5 text-sm text-[var(--text)]" placeholder="添加备注（可选）" />
    </label>
    <div className="mt-1 flex justify-between gap-2 text-xs text-[var(--text-muted)]"><span>{annotation.anchor.headingPath.join(' › ') || '文档正文'}</span><button type="button" onClick={() => onSave(note)} className="text-[var(--accent)] hover:underline">保存备注</button></div>
  </li>
}

/**
 * Reusable controlled annotation surface. It renders already-imported DocumentAnnotations
 * and produces only immutable data updates; source Markdown is never edited here.
 */
export function AnnotationWorkbench({ data, selectedAnchor, onChange, className }: AnnotationWorkbenchProps) {
  const [kind, setKind] = useState<AnnotationKind>('highlight')
  const [note, setNote] = useState('')
  const create = () => {
    if (!selectedAnchor) return
    onChange(addAnnotation(data, kind, selectedAnchor, note))
    setNote('')
  }

  return <section className={className} aria-label="批注工作台">
    <header className="mb-2 flex items-center justify-between gap-2"><h2 className="m-0 text-sm font-semibold">批注</h2><span className="text-xs text-[var(--text-muted)]">{data.annotations.length} 条</span></header>
    <div className="mb-3 rounded border border-[var(--border)] p-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="批注类型">{(Object.keys(annotationLabels) as AnnotationKind[]).map((value) => <button key={value} type="button" onClick={() => setKind(value)} aria-pressed={kind === value} className={`rounded px-2 py-1 text-xs ${kind === value ? 'bg-[var(--accent)] text-white' : 'bg-[var(--hover)]'}`}>{annotationLabels[value]}</button>)}</div>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-2 block w-full rounded border border-[var(--border)] bg-transparent p-1.5 text-sm text-[var(--text)]" placeholder={selectedAnchor ? '添加备注（可选）' : '先在阅读区选中文本'} disabled={!selectedAnchor} />
      <button type="button" onClick={create} disabled={!selectedAnchor} className="mt-2 rounded bg-[var(--accent)] px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50">添加{annotationLabels[kind]}</button>
    </div>
    {!data.annotations.length ? <p className="text-sm text-[var(--text-muted)]">暂无批注。导入的 sidecar 数据也会在这里显示。</p> : <ul className="m-0 list-none space-y-2 p-0">{data.annotations.map((annotation) => <AnnotationCard key={annotation.id} annotation={annotation} onSave={(nextNote) => onChange(updateAnnotationNote(data, annotation.id, nextNote))} onRemove={() => onChange(removeAnnotation(data, annotation.id))} />)}</ul>}
  </section>
}
