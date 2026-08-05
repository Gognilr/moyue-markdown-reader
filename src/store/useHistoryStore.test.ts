import { beforeEach, describe, expect, it } from 'vitest'
import { mergeHistoryItems, useHistoryStore } from './useHistoryStore'

describe('useHistoryStore', () => {
  beforeEach(() => useHistoryStore.setState({ history: [] }))

  it('保留收藏条目，并将非收藏历史限制为最近 50 条', () => {
    const store = useHistoryStore.getState()
    store.addOrUpdateItem('C:/docs/favorite.md', { isFavorite: true })
    for (let index = 0; index < 55; index += 1) {
      store.addOrUpdateItem(`C:/docs/${index}.md`)
    }

    const history = useHistoryStore.getState().history
    expect(history).toHaveLength(51)
    expect(history.find((item) => item.path === 'C:/docs/favorite.md')?.isFavorite).toBe(true)
    expect(history.some((item) => item.path === 'C:/docs/0.md')).toBe(false)
  })

  it('仅更新滚动位置，不改变最近打开时间', () => {
    const store = useHistoryStore.getState()
    store.addOrUpdateItem('C:/docs/guide.md')
    const before = useHistoryStore.getState().history[0].lastOpenedAt

    store.updateScrollPosition('C:/docs/guide.md', 0.75)

    const item = useHistoryStore.getState().history[0]
    expect(item.scrollPositionRatio).toBe(0.75)
    expect(item.lastOpenedAt).toBe(before)
  })

  it('重定位历史项时保留收藏、阅读位置与可恢复的旧路径', () => {
    const store = useHistoryStore.getState()
    store.addOrUpdateItem('C:/docs/old-name.md', { isFavorite: true, scrollPositionRatio: 0.42, contentFingerprint: { version: 1, hash: 'abc', characters: 10, lines: 2 } })

    store.relocateItem('C:/docs/old-name.md', 'D:/archive/new-name.md')

    expect(useHistoryStore.getState().history).toEqual([expect.objectContaining({
      path: 'D:/archive/new-name.md',
      title: 'new-name',
      isFavorite: true,
      scrollPositionRatio: 0.42,
      contentFingerprint: { version: 1, hash: 'abc', characters: 10, lines: 2 },
      previousPaths: ['C:/docs/old-name.md'],
    })])
  })

  it('keeps a document opened while persisted history is hydrating', () => {
    const persisted = [{ path: 'C:/docs/older.md', title: 'older', lastOpenedAt: 10, isFavorite: false, scrollPositionRatio: 0.2 }]
    const runtime = [{ path: 'C:/docs/opened-now.md', title: 'opened-now', lastOpenedAt: 20, isFavorite: false, scrollPositionRatio: 0 }]

    expect(mergeHistoryItems(persisted, runtime)).toEqual([runtime[0], persisted[0]])
  })

  it('moves a reopened document to the top without changing its favorite state', () => {
    const store = useHistoryStore.getState()
    store.addOrUpdateItem('C:/docs/first.md')
    store.addOrUpdateItem('C:/docs/second.md', { isFavorite: true })
    store.addOrUpdateItem('C:/docs/first.md')

    expect(useHistoryStore.getState().history.map((item) => item.path)).toEqual([
      'C:/docs/first.md',
      'C:/docs/second.md',
    ])
    expect(useHistoryStore.getState().history[1].isFavorite).toBe(true)
  })
})
