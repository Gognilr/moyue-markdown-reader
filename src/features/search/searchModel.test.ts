import { describe, expect, it } from 'vitest'
import { findTextMatches, nextTextMatchIndex } from './searchModel'

describe('searchModel', () => {
  it('finds literal case-insensitive matches without treating punctuation as a pattern', () => {
    expect(findTextMatches('A+B a+b A+B', 'a+b')).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 7 },
      { start: 8, end: 11 },
    ])
  })

  it('wraps next and previous navigation', () => {
    const matches = findTextMatches('one two one', 'one')
    expect(nextTextMatchIndex(matches, -1, 1)).toBe(0)
    expect(nextTextMatchIndex(matches, 1, 1)).toBe(0)
    expect(nextTextMatchIndex(matches, 0, -1)).toBe(1)
    expect(nextTextMatchIndex([], 0, 1)).toBe(-1)
  })
})
