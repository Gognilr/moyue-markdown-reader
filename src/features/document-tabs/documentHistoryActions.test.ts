import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentTabsStore } from '../../store/useDocumentTabsStore'
import { applyActiveDocumentHistory, canApplyActiveDocumentHistory } from './documentHistoryActions'

describe('document history bridge', () => {
  beforeEach(() => useDocumentTabsStore.setState({ tabs: [], activeTabId: null }))

  it('checkpoints a pending editor change before undo and mirrors saved protection', () => {
    const store = useDocumentTabsStore.getState()
    store.openDocument({ path: 'C:/docs/guide.md', title: 'guide', content: 'saved' })

    const result = applyActiveDocumentHistory('undo', { path: 'C:/docs/guide.md', content: 'draft' })

    expect(result).toEqual({ content: 'saved', isModified: false })
    expect(canApplyActiveDocumentHistory('undo', 'C:/docs/guide.md')).toBe(false)
    expect(canApplyActiveDocumentHistory('redo', 'C:/docs/guide.md')).toBe(true)
  })

  it('does not apply a tab history action to a different current file', () => {
    const store = useDocumentTabsStore.getState()
    store.openDocument({ path: 'C:/docs/one.md', title: 'one', content: 'saved' })
    store.updateContent('C:/docs/one.md', 'draft')

    expect(applyActiveDocumentHistory('undo', { path: 'C:/docs/two.md', content: 'other' })).toBeNull()
    expect(useDocumentTabsStore.getState().tabs[0].content).toBe('draft')
  })
})
