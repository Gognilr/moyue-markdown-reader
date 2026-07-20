import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fileService } from './fileService'
import { openDocument, saveAllDirtyDocuments, saveCurrentDocument, saveDocumentTab } from './documentService'
import { useDocumentTabsStore } from '../store/useDocumentTabsStore'
import { useFileStore } from '../store/useFileStore'
import { useHistoryStore } from '../store/useHistoryStore'

describe('openDocument session commit', () => {
  beforeEach(() => {
    useDocumentTabsStore.setState({ tabs: [], activeTabId: null })
    useFileStore.setState({
      currentPath: null,
      content: '',
      lastSavedContent: null,
      isModified: false,
      hasExternalChange: false,
      mode: 'read',
    })
    useHistoryStore.setState({ history: [] })
    vi.restoreAllMocks()
  })

  it('commits the same non-empty snapshot to the tab and renderer stores', async () => {
    vi.spyOn(fileService, 'readTextFile').mockResolvedValue('# Loaded\n\nActual document body.')

    const id = await openDocument('C:\\docs\\loaded.md')

    const tabState = useDocumentTabsStore.getState()
    const fileState = useFileStore.getState()
    expect(tabState.activeTabId).toBe(id)
    expect(tabState.tabs).toHaveLength(1)
    expect(tabState.tabs[0]).toMatchObject({
      path: 'C:\\docs\\loaded.md',
      content: '# Loaded\n\nActual document body.',
      savedContent: '# Loaded\n\nActual document body.',
      isDirty: false,
    })
    expect(fileState).toMatchObject({
      currentPath: 'C:\\docs\\loaded.md',
      content: '# Loaded\n\nActual document body.',
      lastSavedContent: '# Loaded\n\nActual document body.',
      isModified: false,
      mode: 'read',
    })
  })

  it('marks the active document clean only after the native write succeeds', async () => {
    const tabId = useDocumentTabsStore.getState().openDocument({
      path: 'C:\\docs\\loaded.md',
      title: 'loaded.md',
      content: 'saved body',
    })
    useDocumentTabsStore.getState().updateContent(tabId, 'edited body')
    useFileStore.getState().restoreDocument({
      path: 'C:\\docs\\loaded.md',
      content: 'edited body',
      savedContent: 'saved body',
      isModified: true,
      mode: 'edit',
    })
    const write = vi.spyOn(fileService, 'writeTextFile').mockResolvedValue()

    await expect(saveCurrentDocument()).resolves.toBe(true)

    expect(write).toHaveBeenCalledWith('C:\\docs\\loaded.md', 'edited body')
    expect(useFileStore.getState()).toMatchObject({
      currentPath: 'C:\\docs\\loaded.md',
      content: 'edited body',
      lastSavedContent: 'edited body',
      isModified: false,
      mode: 'edit',
    })
    expect(useDocumentTabsStore.getState().tabs[0]).toMatchObject({
      content: 'edited body',
      savedContent: 'edited body',
      isDirty: false,
    })
  })

  it('saves every dirty tab before application exit and stops when a Save As is cancelled', async () => {
    const first = useDocumentTabsStore.getState().openDocument({ path: 'C:\\docs\\one.md', title: 'one.md', content: 'saved one' })
    const second = useDocumentTabsStore.getState().openDocument({ id: 'untitled:two', title: 'two.md', content: 'saved two' })
    useDocumentTabsStore.getState().updateContent(first, 'edited one')
    useDocumentTabsStore.getState().updateContent(second, 'edited two')
    const write = vi.spyOn(fileService, 'writeTextFile').mockResolvedValue()
    vi.spyOn(fileService, 'saveFileDialog').mockResolvedValueOnce(null)

    await expect(saveAllDirtyDocuments()).resolves.toBe(false)
    expect(write).toHaveBeenCalledOnce()
    expect(useDocumentTabsStore.getState().tabs.find((tab) => tab.id === first)?.isDirty).toBe(false)
    expect(useDocumentTabsStore.getState().tabs.find((tab) => tab.id === second)?.isDirty).toBe(true)
  })

  it('saves a requested inactive dirty tab without overwriting the active document session', async () => {
    const inactive = useDocumentTabsStore.getState().openDocument({ path: 'C:\\docs\\inactive.md', title: 'inactive.md', content: 'saved inactive' })
    const active = useDocumentTabsStore.getState().openDocument({ path: 'C:\\docs\\active.md', title: 'active.md', content: 'active body' })
    useDocumentTabsStore.getState().activateTab(active)
    useDocumentTabsStore.getState().updateContent(inactive, 'edited inactive')
    useFileStore.getState().restoreDocument({ path: 'C:\\docs\\active.md', content: 'active body', savedContent: 'active body', isModified: false, mode: 'read' })
    const write = vi.spyOn(fileService, 'writeTextFile').mockResolvedValue()

    await expect(saveDocumentTab(inactive)).resolves.toBe(true)

    expect(write).toHaveBeenCalledWith('C:\\docs\\inactive.md', 'edited inactive')
    expect(useDocumentTabsStore.getState().activeTabId).toBe(active)
    expect(useFileStore.getState()).toMatchObject({ currentPath: 'C:\\docs\\active.md', content: 'active body', isModified: false })
    expect(useDocumentTabsStore.getState().tabs.find((tab) => tab.id === inactive)?.isDirty).toBe(false)
  })
})
