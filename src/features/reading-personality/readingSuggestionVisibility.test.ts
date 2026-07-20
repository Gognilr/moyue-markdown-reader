import { describe, expect, it } from 'vitest'
import { hasReadableDocument } from './readingSuggestionVisibility'

describe('reading suggestion visibility', () => {
  it('stays hidden before a document is opened', () => {
    expect(hasReadableDocument(null, '')).toBe(false)
    expect(hasReadableDocument(null, '   \n')).toBe(false)
  })

  it('allows suggestions for opened, new and restored documents', () => {
    expect(hasReadableDocument('E:\\docs\\guide.md', '')).toBe(true)
    expect(hasReadableDocument(null, '# 新文档')).toBe(true)
  })
})
