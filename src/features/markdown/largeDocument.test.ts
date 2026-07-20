import { describe, expect, it } from 'vitest'
import { createLargeDocumentModel, isLargeMarkdown, LARGE_DOCUMENT_CHARACTER_THRESHOLD } from './largeDocument'

describe('large document paging', () => {
  it('keeps ordinary documents on one page', () => {
    const markdown = '# Title\n\nBody'
    expect(isLargeMarkdown(markdown)).toBe(false)
    expect(createLargeDocumentModel(markdown).pages).toHaveLength(1)
  })

  it('paginates a large headed document and maps headings to pages', () => {
    const sections = Array.from({ length: 1800 }, (_, index) => `## Section ${index}\n\n${'content '.repeat(40)}`)
    const markdown = sections.join('\n\n').padEnd(LARGE_DOCUMENT_CHARACTER_THRESHOLD + 1000, ' ')
    const model = createLargeDocumentModel(markdown)
    expect(model.pages.length).toBeGreaterThan(2)
    expect(model.headingPageById.get('section-0')).toBe(0)
    expect(model.headingPageById.get('section-1799')).toBe(model.pages.length - 1)
    expect(model.pages.map((page) => page.markdown).join('\n')).toBe(markdown)
  })

  it('does not split inside a fenced block', () => {
    const markdown = `# Code\n\n\`\`\`text\n${'line\n'.repeat(110_000)}\`\`\``
    expect(createLargeDocumentModel(markdown).pages).toHaveLength(1)
  })
})
