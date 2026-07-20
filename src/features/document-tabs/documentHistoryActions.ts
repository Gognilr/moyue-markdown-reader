import { useDocumentTabsStore } from '../../store/useDocumentTabsStore'

export type DocumentHistoryAction = 'undo' | 'redo'

export interface DocumentHistoryResult {
  content: string
  isModified: boolean
}

/**
 * Applies document-level history through the tab store and returns the state
 * that the legacy file store must mirror.  It deliberately never saves: the
 * resulting dirty flag is derived from the tab's saved checkpoint.
 */
export function applyActiveDocumentHistory(
  action: DocumentHistoryAction,
  current: { path: string | null; content: string },
): DocumentHistoryResult | null {
  const store = useDocumentTabsStore.getState()
  const id = store.activeTabId
  const active = store.tabs.find((tab) => tab.id === id)
  if (!active || active.path !== current.path) return null

  // React effects normally checkpoint the editor's latest keystroke. A
  // shortcut can arrive before that effect, so checkpoint synchronously first.
  if (active.content !== current.content) store.updateContent(active.id, current.content)

  if (action === 'undo') store.undo(active.id)
  else store.redo(active.id)

  const next = useDocumentTabsStore.getState().tabs.find((tab) => tab.id === active.id)
  if (!next) return null
  return { content: next.content, isModified: next.isDirty }
}

export function canApplyActiveDocumentHistory(
  action: DocumentHistoryAction,
  currentPath: string | null,
): boolean {
  const state = useDocumentTabsStore.getState()
  const active = state.tabs.find((tab) => tab.id === state.activeTabId)
  if (!active || active.path !== currentPath) return false
  return action === 'undo' ? active.undoStack.length > 0 : active.redoStack.length > 0
}
