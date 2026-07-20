import { fileService } from './fileService'
import { useFileStore } from '../store/useFileStore'
import { useHistoryStore } from '../store/useHistoryStore'
import { useDocumentTabsStore } from '../store/useDocumentTabsStore'
import { createContentFingerprint } from '../features/relocation/fileRelocation'
import { isOpenPackagePath } from '../features/format-package/importOpenZipPackage'

/** Saves one tab's snapshot without switching away from a different active tab. */
export async function saveDocumentTab(tabId: string): Promise<boolean> {
  const tab = useDocumentTabsStore.getState().tabs.find((candidate) => candidate.id === tabId)
  if (!tab) return false
  if (isOpenPackagePath(tab.path)) {
    throw new Error('Open ZIP packages are read-only previews. Use Save As to create a separate Markdown file.')
  }
  const savePath = tab.path ?? await fileService.saveFileDialog(tab.title || 'untitled.md')
  if (!savePath) return false

  await fileService.writeTextFile(savePath, tab.content)
  const tabs = useDocumentTabsStore.getState()
  tabs.bindSavedPath(tabId, savePath)
  tabs.markSaved(tabId)
  if (tabs.activeTabId === tabId) {
    const mode = useFileStore.getState().mode
    useFileStore.getState().restoreDocument({ path: savePath, content: tab.content, mode })
  }
  useHistoryStore.getState().addOrUpdateItem(savePath, { contentFingerprint: createContentFingerprint(tab.content) })
  return true
}

/** Saves every dirty tab before an application exit; cancellation leaves the window open. */
export async function saveAllDirtyDocuments(): Promise<boolean> {
  const dirtyIds = useDocumentTabsStore.getState().tabs.filter((tab) => tab.isDirty).map((tab) => tab.id)
  for (const tabId of dirtyIds) {
    if (!await saveDocumentTab(tabId)) return false
  }
  return true
}

/** 保存当前编辑内容；用户取消“另存为”时返回 false。 */
export async function saveCurrentDocument(): Promise<boolean> {
  const { currentPath, content, mode, restoreDocument } = useFileStore.getState()
  const activeTabId = useDocumentTabsStore.getState().activeTabId
  if (activeTabId) return saveDocumentTab(activeTabId)
  if (isOpenPackagePath(currentPath)) {
    throw new Error('Open ZIP packages are read-only previews. Use Save As to create a separate Markdown file.')
  }
  const savePath = currentPath ?? await fileService.saveFileDialog('untitled.md')
  if (!savePath) return false

  await fileService.writeTextFile(savePath, content)
  restoreDocument({ path: savePath, content, mode })
  useHistoryStore.getState().addOrUpdateItem(savePath, { contentFingerprint: createContentFingerprint(content) })
  return true
}

/** 读取磁盘文档并原子更新编辑状态。 */
export async function openDocument(path: string): Promise<string> {
  const content = await fileService.readTextFile(path)
  const id = useDocumentTabsStore.getState().openDocument({
    path,
    title: fileService.getFileName(path),
    content,
  })
  useDocumentTabsStore.getState().activateTab(id)
  useFileStore.getState().restoreDocument({ path, content })
  useHistoryStore.getState().addOrUpdateItem(path, { contentFingerprint: createContentFingerprint(content) })
  return id
}
