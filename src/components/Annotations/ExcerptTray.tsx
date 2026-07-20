import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Excerpt } from '../../types'
import { excerptCategories, excerptCategory, excerptKeyboardAction, excerptSourceReference, excerptToMarkdown, filterAndSortExcerpts, type ExcerptSort } from '../../features/annotations/excerptTrayModel'

export interface ExcerptTrayProps {
  excerpts: readonly Excerpt[]
  /** Usually a friendly file name; the document key is a safe fallback. */
  documentLabel: string
  onRemove: (id: string) => void
  /** Host persistence makes a manual order survive reload and sidecar write. */
  onReorder?: (activeId: string, targetId: string) => void
  /** Called by Enter or the "返回原位置" button when a host can resolve source anchors. */
  onNavigate?: (excerpt: Excerpt) => void
}

async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入')
  await navigator.clipboard.writeText(value)
}

/**
 * Controlled excerpt tray with local presentation controls only. It never mutates the
 * source document or annotation sidecar. Keyboard: Up/Down focus, Enter navigate,
 * Delete remove, Ctrl/Cmd+C copy, Ctrl/Cmd+R citation, Ctrl/Cmd+M Markdown.
 */
export function ExcerptTray({ excerpts, documentLabel, onRemove, onReorder, onNavigate }: ExcerptTrayProps) {
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<ExcerptSort>('newest')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const itemRefs = useRef(new Map<string, HTMLLIElement>())
  const categories = useMemo(() => excerptCategories(excerpts), [excerpts])
  const visible = useMemo(() => filterAndSortExcerpts(excerpts, { category, sort }), [excerpts, category, sort])

  const copy = async (value: string, label: string) => {
    try { await copyText(value); setNotice(`已复制${label}`) } catch { setNotice('无法访问剪贴板，请在桌面应用中重试') }
  }
  const focusRelative = (id: string, offset: number) => {
    const index = visible.findIndex((excerpt) => excerpt.id === id)
    const next = visible[(index + offset + visible.length) % visible.length]
    if (next) { setActiveId(next.id); itemRefs.current.get(next.id)?.focus() }
  }
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>, excerpt: Excerpt) => {
    const action = excerptKeyboardAction(event.key, event.ctrlKey || event.metaKey)
    if (!action) return
    event.preventDefault()
    if (action === 'previous') return focusRelative(excerpt.id, -1)
    if (action === 'next') return focusRelative(excerpt.id, 1)
    if (action === 'remove') return onRemove(excerpt.id)
    if (action === 'navigate') return onNavigate?.(excerpt)
    if (action === 'copy-plain') void copy(excerpt.content, '原文')
    if (action === 'copy-reference') void copy(excerptSourceReference(excerpt, documentLabel), '来源引用')
    if (action === 'copy-markdown') void copy(excerptToMarkdown(excerpt, documentLabel), 'Markdown 摘录')
  }

  const move = (excerpt: Excerpt, offset: number) => {
    const index = visible.findIndex((item) => item.id === excerpt.id)
    const target = visible[index + offset]
    if (!target) return
    onReorder?.(excerpt.id, target.id)
    setSort('manual')
    setActiveId(excerpt.id)
  }

  return <section aria-label="摘录托盘">
    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
      <label>类别 <select value={category} onChange={(event) => setCategory(event.target.value)} className="rounded border border-[var(--border)] bg-[var(--paper)] p-1"><option value="">全部</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>排序 <select value={sort} onChange={(event) => setSort(event.target.value as ExcerptSort)} className="rounded border border-[var(--border)] bg-[var(--paper)] p-1"><option value="newest">最新采集</option><option value="oldest">最早采集</option><option value="source">原文位置</option><option value="manual">手动顺序</option></select></label>
    </div>
    <p className="sr-only" aria-live="polite">{notice}</p>
    {!visible.length ? <p className="text-xs text-[var(--text-muted)]">没有符合当前类别的摘录。</p> : <ul className="space-y-2">{visible.map((excerpt) => <li key={excerpt.id} ref={(node) => { if (node) itemRefs.current.set(excerpt.id, node); else itemRefs.current.delete(excerpt.id) }} tabIndex={activeId === null || activeId === excerpt.id ? 0 : -1} onFocus={() => setActiveId(excerpt.id)} onKeyDown={(event) => onKeyDown(event, excerpt)} className="rounded border border-[var(--border)] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
      <blockquote className="m-0 border-l-2 border-[var(--accent)] pl-2">{excerpt.content}</blockquote>
      <p className="mb-1 mt-2 text-xs text-[var(--text-muted)]">{excerptCategory(excerpt)} · {new Date(excerpt.createdAt).toLocaleString()}</p>
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs"><button type="button" onClick={() => void copy(excerpt.content, '原文')} className="text-[var(--accent)] hover:underline">复制原文</button><button type="button" onClick={() => void copy(excerptSourceReference(excerpt, documentLabel), '来源引用')} className="text-[var(--accent)] hover:underline">复制引用</button><button type="button" onClick={() => void copy(excerptToMarkdown(excerpt, documentLabel), 'Markdown 摘录')} className="text-[var(--accent)] hover:underline">复制 Markdown</button>{onNavigate && <button type="button" onClick={() => onNavigate(excerpt)} className="text-[var(--accent)] hover:underline">返回原位置</button>}<button type="button" onClick={() => onRemove(excerpt.id)} className="hover:text-red-600">删除</button></div>
      {onReorder && <div className="mt-1 flex gap-2 text-xs"><button type="button" disabled={visible[0]?.id === excerpt.id} onClick={() => move(excerpt, -1)} className="text-[var(--accent)] hover:underline disabled:opacity-40">上移</button><button type="button" disabled={visible[visible.length - 1]?.id === excerpt.id} onClick={() => move(excerpt, 1)} className="text-[var(--accent)] hover:underline disabled:opacity-40">下移</button></div>}
    </li>)}</ul>}
  </section>
}
