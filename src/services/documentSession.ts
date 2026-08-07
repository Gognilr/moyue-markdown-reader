import { useDocumentTabsStore } from '../store/useDocumentTabsStore'
import { useFileStore } from '../store/useFileStore'

/** Copies the visible editor snapshot into its active tab before navigation. */
export function checkpointActiveDocument(): void {
  const tabState = useDocumentTabsStore.getState()
  const active = tabState.tabs.find((tab) => tab.id === tabState.activeTabId)
  const current = useFileStore.getState()
  if (active && active.path === current.currentPath && active.content !== current.content) {
    tabState.updateContent(active.id, current.content)
  }
}

/**
 * Activates and restores a tab synchronously. Relying only on a later React
 * bridge effect leaves a short split-brain window where the tab strip and the
 * legacy single-document renderer can point at different files.
 */
export function activateDocumentSession(id: string): boolean {
  checkpointActiveDocument()
  const tabState = useDocumentTabsStore.getState()
  const target = tabState.tabs.find((tab) => tab.id === id)
  if (!target) return false
  tabState.activateTab(id)
  useFileStore.getState().restoreDocument({
    path: target.path,
    content: target.content,
    savedContent: target.savedContent,
    isModified: target.isDirty,
    mode: 'read',
  })
  return true
}
