import { useMemo, useState } from 'react'
import type { DocumentLensFilter, DocumentLensItem } from '../../types'
import { filterDocumentLens, groupDocumentLens } from '../../features/document-lens/documentLens'
import { documentLensOriginal, documentLensSourceCitation } from '../../features/document-lens/documentLensActions'

const filters: Array<{ id: DocumentLensFilter; label: string }> = [
  { id: 'all', label: '全部' }, { id: 'conclusion', label: '只看结论' }, { id: 'action', label: '只看行动' },
  { id: 'risk', label: '只看风险' }, { id: 'command', label: '只看命令' }, { id: 'data', label: '只看数据' },
]

/** Presentational, local-only lens. Source line navigation remains in the host. */
export function DocumentLensPanel({ items, documentLabel = '当前文档', onOpenSource }: { items: DocumentLensItem[]; documentLabel?: string; onOpenSource?: (item: DocumentLensItem) => void }) {
  const [filter, setFilter] = useState<DocumentLensFilter>('all'); const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const groups = useMemo(() => groupDocumentLens(filterDocumentLens(items, filter, query)), [items, filter, query])
  const copy = async (value: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(value)
      setNotice(`已复制${label}`)
    } catch {
      setNotice('无法访问剪贴板；请在桌面应用中重试。')
    }
  }
  return <section className="document-lens" aria-label="文档透镜">
    <header><div><h2>文档透镜</h2><p>只用本地确定性规则提取，始终可回到原文。</p></div><span>{groups.reduce((total, group) => total + group.items.length, 0)} 条</span></header>
    <div className="document-lens__controls"><div role="group" aria-label="透镜筛选">{filters.map((entry) => <button key={entry.id} type="button" aria-pressed={filter === entry.id} onClick={() => setFilter(entry.id)}>{entry.label}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选提取内容" aria-label="筛选透镜内容" /></div>
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>
    {!groups.length ? <p className="document-lens__empty">当前规则没有找到匹配内容。</p> : <div className="document-lens__results">{groups.map((group) => <section key={group.heading}><h3>{group.heading}</h3><ul>{group.items.map((item) => <li key={item.id}><button type="button" onClick={() => onOpenSource?.(item)}><span>第 {item.line} 行 · {item.reason}</span><strong>{item.text}</strong></button>{filter === 'command' && <div className="document-lens__item-actions" aria-label={`命令操作：第 ${item.line} 行`}><button type="button" onClick={() => void copy(documentLensOriginal(item), '原文')}>复制原文</button><button type="button" onClick={() => void copy(documentLensSourceCitation(item, documentLabel), '带来源引用')}>复制带来源引用</button><button type="button" onClick={() => onOpenSource?.(item)}>返回原位置</button></div>}</li>)}</ul></section>)}</div>}
  </section>
}
