import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentTabsStore } from '../store/useDocumentTabsStore'
import { useFileStore } from '../store/useFileStore'
import { activateDocumentSession } from './documentSession'

describe('document session activation', () => {
  beforeEach(() => {
    useDocumentTabsStore.setState({ tabs: [], activeTabId: null })
    useFileStore.getState().restoreDocument({ path: null, content: '', mode: 'read' })
  })

  it('checkpoints the current edit and atomically restores the selected dirty tab', () => {
    const tabs = useDocumentTabsStore.getState()
    const firstId = tabs.openDocument({ path: 'C:\\docs\\a.md', title: 'a.md', content: '# A' })
    const secondId = tabs.openDocument({ path: 'C:\\docs\\b.md', title: 'b.md', content: '# B' })
    useFileStore.getState().restoreDocument({ path: 'C:\\docs\\b.md', content: '# B changed', savedContent: '# B', isModified: true, mode: 'edit' })

    expect(activateDocumentSession(firstId)).toBe(true)
    expect(useDocumentTabsStore.getState().tabs.find((tab) => tab.id === secondId)).toMatchObject({ content: '# B changed', isDirty: true })
    expect(useDocumentTabsStore.getState().activeTabId).toBe(firstId)
    expect(useFileStore.getState()).toMatchObject({ currentPath: 'C:\\docs\\a.md', content: '# A', isModified: false, mode: 'read' })

    expect(activateDocumentSession(secondId)).toBe(true)
    expect(useFileStore.getState()).toMatchObject({ currentPath: 'C:\\docs\\b.md', content: '# B changed', lastSavedContent: '# B', isModified: true })
  })
})
