import type { BlockAnchor, CognitiveRoute } from '../../types'
import type { ReadingUnderstandingState } from '../../features/reading-ledger/readingLedger'

const labels = { prerequisite: '前置', conclusion: '结论', evidence: '证据', risk: '风险', step: '步骤' } as const
const readingLabels: Record<ReadingUnderstandingState, string> = { understood: '已理解', questioned: '存疑', skipped: '暂跳过', disagreed: '不同意' }

/**
 * The route always retains author-source navigation.  It can surface and write
 * only explicit reader marks supplied by its host; route progress is never
 * converted into an understanding state.
 */
export function CognitiveRoutePanel({ route, onOpenSource, readingStates = {}, onRecordReadingState }: {
  route: CognitiveRoute
  onOpenSource?: (anchorId: string) => void
  readingStates?: Readonly<Record<string, ReadingUnderstandingState>>
  onRecordReadingState?: (state: ReadingUnderstandingState, anchor: BlockAnchor) => void
}) {
  return <section aria-label="认知航线" className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3">
    <header className="flex items-center justify-between"><h2 className="text-sm font-semibold">认知航线</h2><span className="text-xs text-[var(--text-muted)]">{route.nodes.length} 个来源节点</span></header>
    <ol className="space-y-2">{route.nodes.map((node, index) => <li key={node.id} className="rounded-lg bg-[var(--hover)] p-2">
      <button type="button" className="w-full text-left" onClick={() => onOpenSource?.(node.source.id)}>
        <span className="mr-2 text-xs text-[var(--text-muted)]">{index + 1}. {labels[node.kind]}</span><span className="text-sm">{node.title.replace(/^[^：]+：/, '')}</span>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{node.explanation}</p>
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1" role="group" aria-label={`${node.title} 的阅读状态`}>
        <span className="mr-1 text-xs text-[var(--text-muted)]">{readingStates[node.source.id] ? `已标记：${readingLabels[readingStates[node.source.id]]}` : '未标记'}</span>
        {(Object.keys(readingLabels) as ReadingUnderstandingState[]).map((state) => <button key={state} type="button" onClick={() => onRecordReadingState?.(state, node.source)} aria-pressed={readingStates[node.source.id] === state} className={`rounded px-2 py-1 text-xs ${readingStates[node.source.id] === state ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)] hover:bg-[var(--paper)]'}`}>{readingLabels[state]}</button>)}
      </div>
    </li>)}</ol>
  </section>
}
