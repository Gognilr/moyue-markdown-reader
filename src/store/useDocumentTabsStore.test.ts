import { beforeEach, describe, expect, it } from 'vitest'
import { useDocumentTabsStore } from './useDocumentTabsStore'

describe('useDocumentTabsStore', () => {
  beforeEach(() => useDocumentTabsStore.setState({ tabs: [], activeTabId: null }))

  it('opens lightweight tabs once and activates an already-open file', () => {
    const store = useDocumentTabsStore.getState()
    store.openDocument({ path: 'C:/docs/one.md', title: 'one', content: '# one' })
    store.openDocument({ path: 'C:/docs/two.md', title: 'two', content: '# two' })
    store.openDocument({ path: 'C:/docs/one.md', title: 'stale title', content: 'stale' })

    const state = useDocumentTabsStore.getState()
    expect(state.tabs).toHaveLength(2)
    expect(state.activeTabId).toBe('C:/docs/one.md')
    expect(state.tabs[0].content).toBe('# one')
  })

  it('keeps undo and redo isolated per document and derives dirty state from saved content', () => {
    const store = useDocumentTabsStore.getState()
    store.openDocument({ path: 'C:/docs/one.md', title: 'one', content: 'saved' })
    store.openDocument({ path: 'C:/docs/two.md', title: 'two', content: 'two' })
    store.updateContent('C:/docs/one.md', 'first')
    store.updateContent('C:/docs/one.md', 'second')
    store.undo('C:/docs/one.md')

    let one = useDocumentTabsStore.getState().tabs[0]
    expect(one.content).toBe('first')
    expect(one.isDirty).toBe(true)
    expect(useDocumentTabsStore.getState().tabs[1].undoStack).toEqual([])

    store.undo('C:/docs/one.md')
    one = useDocumentTabsStore.getState().tabs[0]
    expect(one.content).toBe('saved')
    expect(one.isDirty).toBe(false)
    store.redo('C:/docs/one.md')
    expect(useDocumentTabsStore.getState().tabs[0].content).toBe('first')
  })

  it('never closes a dirty tab without an explicit discard decision', () => {
    const store = useDocumentTabsStore.getState()
    store.openDocument({ id: 'untitled:1', title: 'Untitled', content: '' })
    store.updateContent('untitled:1', 'draft')

    expect(store.requestClose('untitled:1')).toMatchObject({ kind: 'confirm-discard', tab: { title: 'Untitled' } })
    expect(store.closeTab('untitled:1')).toBe(false)
    expect(useDocumentTabsStore.getState().tabs).toHaveLength(1)
    expect(store.discardAndClose('untitled:1')).toBe(true)
    expect(useDocumentTabsStore.getState().tabs).toHaveLength(0)
  })

  it('keeps a recovered crash draft dirty until an explicit save', () => {
    const store = useDocumentTabsStore.getState()
    const id = store.openDocument({ id: 'recovered:1', title: 'Recovered', content: '# draft' })

    store.restoreDraft(id, '# draft')

    expect(useDocumentTabsStore.getState().tabs[0]).toMatchObject({
      content: '# draft',
      isDirty: true,
    })
    expect(store.requestClose(id)).toMatchObject({ kind: 'confirm-discard' })
  })

  it('moves active focus to a neighbouring tab after a clean close', () => {
    const store = useDocumentTabsStore.getState()
    store.openDocument({ id: 'a', title: 'A', content: '' })
    store.openDocument({ id: 'b', title: 'B', content: '' })
    store.openDocument({ id: 'c', title: 'C', content: '' })
    store.activateTab('b')
    expect(store.closeTab('b')).toBe(true)
    expect(useDocumentTabsStore.getState().activeTabId).toBe('c')
  })
})
