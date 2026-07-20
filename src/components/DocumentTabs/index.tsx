import { X } from 'lucide-react'
import type { DocumentTab } from '../../types'
import './styles.css'

export interface DocumentTabsProps {
  tabs: DocumentTab[]
  activeTabId: string | null
  onActivate: (id: string) => void
  /** Called for every close affordance. Callers must use requestClose before discarding a dirty tab. */
  onRequestClose: (id: string) => void
  className?: string
}

/**
 * Presentational tab strip. It intentionally owns no document state, so the host
 * can connect it to the unsaved-changes dialog rather than silently discarding a draft.
 */
export function DocumentTabs({ tabs, activeTabId, onActivate, onRequestClose, className }: DocumentTabsProps) {
  if (tabs.length === 0) return null

  return (
    <div className={['document-tabs', className].filter(Boolean).join(' ')} role="tablist" aria-label="打开的文档">
      {tabs.map((tab) => {
        const selected = tab.id === activeTabId
        const label = tab.isDirty ? `${tab.title}，有未保存修改` : tab.title
        return (
          <div className="document-tabs__item" key={tab.id}>
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`document-panel-${tab.id}`}
              id={`document-tab-${tab.id}`}
              className="document-tabs__activate"
              title={label}
              onPointerDown={() => onActivate(tab.id)}
              onClick={(event) => {
                // Pointer activation is handled on pointer-down so the visible
                // document changes before a following focus/blur checkpoint can
                // race it. Keyboard-synthesised clicks have detail === 0.
                if (event.detail === 0) onActivate(tab.id)
              }}
            >
              <span className="document-tabs__title">{tab.title}</span>
              {tab.isDirty && <span className="document-tabs__dirty" aria-label="有未保存修改">●</span>}
            </button>
            <button
              type="button"
              className="document-tabs__close"
              aria-label={`关闭 ${label}`}
              title={`关闭 ${label}`}
              onClick={(event) => {
                event.stopPropagation()
                onRequestClose(tab.id)
              }}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
