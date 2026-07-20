import { useMemo } from 'react'
import { getSemanticItems, sampleSemanticItems, semanticKindLabels, semanticSelector, type SemanticItem } from './semanticRibbon'
import type { LiveMirrorOverlay } from './overlays'

interface SemanticRibbonProps {
  content: string
  live: boolean
  overlays?: readonly LiveMirrorOverlay[]
  onNavigateOverlay?: (overlay: LiveMirrorOverlay) => void
}

const symbols = { heading: '#', code: '</>', image: 'I', table: 'T', task: '✓' } as const
const overlaySymbols: Record<LiveMirrorOverlay['kind'], string> = { search: 'S', annotation: 'A', warning: '!', risk: 'R', 'open-task': '□' }
const overlayLabels: Record<LiveMirrorOverlay['kind'], string> = { search: '搜索结果', annotation: '批注', warning: '警告', risk: '风险', 'open-task': '未完成任务' }

export function SemanticRibbon({ content, live, overlays = [], onNavigateOverlay }: SemanticRibbonProps) {
  const items = useMemo(() => getSemanticItems(content), [content])
  const visibleItems = useMemo(() => sampleSemanticItems(items, 36), [items])
  const visibleOverlays = useMemo(() => sampleSemanticItems(overlays, 8), [overlays])
  const visibleCount = visibleItems.length + visibleOverlays.length

  const navigate = (item: SemanticItem) => {
    if (item.kind === 'heading' && item.id) {
      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    const target = document.querySelector('.markdown-view')
      ?.querySelectorAll<HTMLElement>(semanticSelector(item.kind))[item.occurrence]
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!items.length && !overlays.length) return null

  return (
    <aside className="semantic-ribbon" aria-label="文档语义导航">
      <div className="semantic-ribbon__live" title={live ? '外部文件变更会自动刷新当前阅读视图' : '打开本地 Markdown 文件后启用实时镜像'}>
        <span className={live ? 'semantic-ribbon__pulse' : ''} />
        {live ? 'Live' : '本地'}
      </div>
      <div className="semantic-ribbon__items" style={{ '--semantic-item-count': visibleCount } as React.CSSProperties}>
        {visibleItems.map((item, index) => (
          <button key={`${item.kind}-${item.occurrence}-${index}`} type="button" className={`semantic-ribbon__item semantic-ribbon__item--${item.kind}`} onClick={() => navigate(item)} title={`${semanticKindLabels[item.kind]}：${item.label}`} aria-label={`跳转至${semanticKindLabels[item.kind]}：${item.label}`}>
            <span aria-hidden="true">{symbols[item.kind]}</span>
          </button>
        ))}
        {visibleOverlays.map((overlay) => (
          <button key={`overlay-${overlay.id}`} type="button" className={`semantic-ribbon__item semantic-ribbon__item--${overlay.kind}`} onClick={() => onNavigateOverlay?.(overlay)} title={`${overlayLabels[overlay.kind]}：第 ${overlay.line} 行，${overlay.label}`} aria-label={`跳转至${overlayLabels[overlay.kind]}：第 ${overlay.line} 行，${overlay.label}`}>
            <span aria-hidden="true">{overlaySymbols[overlay.kind]}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}
