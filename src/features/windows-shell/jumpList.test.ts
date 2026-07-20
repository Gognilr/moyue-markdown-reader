import { describe, expect, it } from 'vitest'
import { buildJumpListPayload } from './jumpList'

describe('Windows Jump List payload', () => {
  it('separates favorites and orders recent Markdown documents', () => {
    const payload = buildJumpListPayload([
      { path: 'C:\\docs\\old.md', title: 'old', isFavorite: true, lastOpenedAt: 1, scrollPositionRatio: 0 },
      { path: 'C:\\docs\\new.markdown', title: 'new', isFavorite: false, lastOpenedAt: 3, scrollPositionRatio: 0 },
      { path: 'C:\\docs\\ignored.txt', title: 'ignored', isFavorite: true, lastOpenedAt: 4, scrollPositionRatio: 0 },
    ])
    expect(payload.favorites.map((item) => item.title)).toEqual(['old'])
    expect(payload.recent.map((item) => item.title)).toEqual(['new', 'old'])
  })
})
