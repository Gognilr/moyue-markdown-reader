import type { Excerpt } from '../../types'

/** `manual` follows the persisted excerpt array after an explicit reader move. */
export type ExcerptSort = 'newest' | 'oldest' | 'source' | 'manual'

export interface ExcerptFilter {
  /** An empty value includes every heading category. */
  category?: string
  sort?: ExcerptSort
}

/** The first heading is a stable, readable category for a captured passage. */
export function excerptCategory(excerpt: Excerpt): string {
  return excerpt.anchor.headingPath[0]?.trim() || '文档正文'
}

export function excerptCategories(excerpts: readonly Excerpt[]): string[] {
  return [...new Set(excerpts.map(excerptCategory))].sort((a, b) => {
    if (a === '文档正文') return 1
    if (b === '文档正文') return -1
    return a.localeCompare(b, 'zh-CN')
  })
}

/** Does not mutate persisted excerpts, so a tray can safely derive its current view. */
export function filterAndSortExcerpts(excerpts: readonly Excerpt[], filter: ExcerptFilter = {}): Excerpt[] {
  const selected = filter.category?.trim()
  const result = excerpts.filter((excerpt) => !selected || excerptCategory(excerpt) === selected)
  const sort = filter.sort ?? 'newest'
  if (sort === 'manual') return [...result]
  return [...result].sort((left, right) => {
    if (sort === 'source') {
      // A heading-less capture has no reliable relative source offset; show it after
      // structured sections rather than inventing a position before the document.
      const leftPath = left.anchor.headingPath.length ? left.anchor.headingPath.join('\u0000') : '\uffff'
      const rightPath = right.anchor.headingPath.length ? right.anchor.headingPath.join('\u0000') : '\uffff'
      const sourceOrder = leftPath.localeCompare(rightPath, 'zh-CN')
      return sourceOrder || left.createdAt - right.createdAt || left.id.localeCompare(right.id)
    }
    const timeOrder = sort === 'newest' ? right.createdAt - left.createdAt : left.createdAt - right.createdAt
    return timeOrder || left.id.localeCompare(right.id)
  })
}

/** Moves a passage by identity without changing the remaining records. */
export function reorderExcerpts(excerpts: readonly Excerpt[], activeId: string, targetId: string): Excerpt[] {
  if (activeId === targetId) return [...excerpts]
  const from = excerpts.findIndex((excerpt) => excerpt.id === activeId)
  const to = excerpts.findIndex((excerpt) => excerpt.id === targetId)
  if (from < 0 || to < 0) return [...excerpts]
  const next = [...excerpts]
  const [active] = next.splice(from, 1)
  next.splice(to, 0, active)
  return next
}

function quoteMarkdown(text: string): string {
  return text.split(/\r?\n/).map((line) => `> ${line}`).join('\n')
}

export function excerptSourceReference(excerpt: Excerpt, documentLabel: string): string {
  const path = excerpt.anchor.headingPath.length ? ` > ${excerpt.anchor.headingPath.join(' > ')}` : ''
  return `来源：${documentLabel}${path}`
}

export function excerptToMarkdown(excerpt: Excerpt, documentLabel: string): string {
  return `${quoteMarkdown(excerpt.content)}\n\n${excerptSourceReference(excerpt, documentLabel)}`
}

export type ExcerptKeyboardAction = 'previous' | 'next' | 'copy-plain' | 'copy-reference' | 'copy-markdown' | 'remove' | 'navigate' | null

/** Shared keyboard map; host components decide whether a destructive action is enabled. */
export function excerptKeyboardAction(key: string, modifier = false): ExcerptKeyboardAction {
  if (key === 'ArrowUp') return 'previous'
  if (key === 'ArrowDown') return 'next'
  if (key === 'Enter') return 'navigate'
  if (key === 'Delete' || key === 'Backspace') return 'remove'
  if (!modifier) return null
  if (key.toLowerCase() === 'c') return 'copy-plain'
  if (key.toLowerCase() === 'r') return 'copy-reference'
  if (key.toLowerCase() === 'm') return 'copy-markdown'
  return null
}
