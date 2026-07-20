import { describe, expect, it } from 'vitest'
import type { Excerpt } from '../../types'
import { excerptCategories, excerptKeyboardAction, excerptSourceReference, excerptToMarkdown, filterAndSortExcerpts, reorderExcerpts } from './excerptTrayModel'

const excerpts: Excerpt[] = [
  { id: 'a', content: '第二条', anchor: { quote: '第二条', prefix: '', suffix: '', headingPath: ['概览', '背景'] }, createdAt: 20 },
  { id: 'b', content: '第一条', anchor: { quote: '第一条', prefix: '', suffix: '', headingPath: ['结论'] }, createdAt: 10 },
  { id: 'c', content: '正文', anchor: { quote: '正文', prefix: '', suffix: '', headingPath: [] }, createdAt: 30 },
]

describe('excerpt tray model', () => {
  it('derives categories and filters without mutating saved data', () => {
    expect(excerptCategories(excerpts)).toEqual(['概览', '结论', '文档正文'])
    expect(filterAndSortExcerpts(excerpts, { category: '概览' }).map((excerpt) => excerpt.id)).toEqual(['a'])
    expect(filterAndSortExcerpts(excerpts).map((excerpt) => excerpt.id)).toEqual(['c', 'a', 'b'])
    expect(excerpts.map((excerpt) => excerpt.id)).toEqual(['a', 'b', 'c'])
  })

  it('supports source ordering, identity reorder and shareable citations', () => {
    expect(filterAndSortExcerpts(excerpts, { sort: 'source' }).map((excerpt) => excerpt.id)).toEqual(['a', 'b', 'c'])
    expect(reorderExcerpts(excerpts, 'c', 'a').map((excerpt) => excerpt.id)).toEqual(['c', 'a', 'b'])
    expect(reorderExcerpts(excerpts, 'missing', 'a')).toEqual(excerpts)
    expect(filterAndSortExcerpts(reorderExcerpts(excerpts, 'c', 'a'), { sort: 'manual' }).map((excerpt) => excerpt.id)).toEqual(['c', 'a', 'b'])
    expect(excerptSourceReference(excerpts[0], '设计.md')).toBe('来源：设计.md > 概览 > 背景')
    expect(excerptToMarkdown(excerpts[0], '设计.md')).toContain('> 第二条')
  })

  it('exposes keyboard behavior independently from the DOM', () => {
    expect(excerptKeyboardAction('ArrowDown')).toBe('next')
    expect(excerptKeyboardAction('c', true)).toBe('copy-plain')
    expect(excerptKeyboardAction('m', true)).toBe('copy-markdown')
    expect(excerptKeyboardAction('Delete')).toBe('remove')
  })
})
