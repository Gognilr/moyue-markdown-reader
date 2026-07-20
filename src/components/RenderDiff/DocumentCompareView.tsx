import { useRef } from 'react'
import type { CompareEntry, DocumentCompareModel } from '../../features/render-diff/documentCompare'

export interface DocumentCompareViewProps {
  model: DocumentCompareModel
  /** Lets a host scroll its reader/editor to the semantic source block. */
  onSelectEntry?: (entry: CompareEntry) => void
  className?: string
}

const labels = { unchanged: 'Unchanged', added: 'Added', removed: 'Removed', modified: 'Modified' } as const
const colors = { unchanged: 'border-slate-200 bg-white', added: 'border-emerald-200 bg-emerald-50', removed: 'border-rose-200 bg-rose-50', modified: 'border-amber-200 bg-amber-50' } as const

/**
 * Presentational semantic diff. The caller supplies a model and owns all loading,
 * persistence, review export, and navigation. Scroll positions are mirrored here.
 */
export function DocumentCompareView({ model, onSelectEntry, className = '' }: DocumentCompareViewProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const sync = (from: HTMLDivElement, to: HTMLDivElement | null) => {
    if (syncing.current || !to) return
    syncing.current = true
    to.scrollTop = from.scrollTop
    requestAnimationFrame(() => { syncing.current = false })
  }
  return <section aria-label="Rendered document comparison" className={`rounded-xl border border-[var(--border)] bg-[var(--paper)] ${className}`}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2 text-sm">
      <span className="font-semibold">Rendered document comparison</span>
      <span className="text-xs text-[var(--text-muted)]">{model.summary.added} added · {model.summary.removed} removed · {model.summary.modified} changed</span>
    </header>
    <div className="grid grid-cols-2 border-b border-[var(--border)] text-sm font-medium">
      <span className="border-r border-[var(--border)] px-3 py-2">{model.leftLabel}</span><span className="px-3 py-2">{model.rightLabel}</span>
    </div>
    <div className="grid max-h-[32rem] grid-cols-2 overflow-hidden text-sm">
      <div ref={leftRef} onScroll={(event) => sync(event.currentTarget, rightRef.current)} className="space-y-2 overflow-auto border-r border-[var(--border)] p-2">
        {model.entries.map((item) => <DiffCell key={item.id} entry={item} side="left" onSelect={onSelectEntry} />)}
      </div>
      <div ref={rightRef} onScroll={(event) => sync(event.currentTarget, leftRef.current)} className="space-y-2 overflow-auto p-2">
        {model.entries.map((item) => <DiffCell key={item.id} entry={item} side="right" onSelect={onSelectEntry} />)}
      </div>
    </div>
  </section>
}

function DiffCell({ entry, side, onSelect }: { entry: CompareEntry; side: 'left' | 'right'; onSelect?: (entry: CompareEntry) => void }) {
  const block = side === 'left' ? entry.left : entry.right
  if (!block) return <div className="min-h-10 rounded border border-dashed border-slate-200 bg-slate-50 p-2 text-xs text-slate-400">No corresponding block</div>
  return <button type="button" onClick={() => onSelect?.(entry)} className={`block w-full rounded border p-2 text-left focus:outline-none focus:ring-2 focus:ring-sky-500 ${colors[entry.kind]}`}>
    <span className="block text-xs font-medium text-slate-500">{labels[entry.kind]} · {block.kind} · line {block.line}</span>
    {entry.cellChanges
      ? <TableRowDiff cells={block.cells ?? []} changes={entry.cellChanges} side={side} />
      : <span className="mt-1 block whitespace-pre-wrap">{block.text}</span>}
  </button>
}

function TableRowDiff({ cells, changes, side }: { cells: string[]; changes: NonNullable<CompareEntry['cellChanges']>; side: 'left' | 'right' }) {
  return <span className="mt-2 block overflow-x-auto rounded border border-slate-200 bg-white/70 p-1" aria-label="Table row cell changes">
    <span className="flex min-w-max gap-1">
      {cells.map((cell, index) => {
        const kind = changes[index]?.kind ?? 'unchanged'
        const showChange = kind !== 'unchanged' && !(kind === 'added' && side === 'left') && !(kind === 'removed' && side === 'right')
        const tone = !showChange ? 'border-slate-200 bg-white' : kind === 'modified' ? 'border-amber-400 bg-amber-100 text-amber-950' : kind === 'added' ? 'border-emerald-400 bg-emerald-100 text-emerald-950' : 'border-rose-400 bg-rose-100 text-rose-950'
        return <span key={`${index}:${cell}`} className={`max-w-52 truncate rounded border px-1.5 py-1 text-xs ${tone}`} title={cell}>{cell || '∅'}</span>
      })}
    </span>
    <span className="mt-1 block text-xs text-slate-500">{changes.filter((cell) => cell.kind !== 'unchanged').length} table cell change(s)</span>
  </span>
}
