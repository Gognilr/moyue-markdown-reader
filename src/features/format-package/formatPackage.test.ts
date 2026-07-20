import { describe, expect, it } from 'vitest'
import { buildFormatPackage, normalizeBaseName } from './formatPackage'
import { markdownToStandaloneHtml } from './standaloneHtml'

describe('standalone HTML and format package', () => {
  it('preserves Markdown IR structure in one HTML document without external scripts', () => {
    const html = markdownToStandaloneHtml('# 标题\n\n正文 with **strong** and [link](guide.md).\n\n![图](images/a.png)\n\n| A | B |\n|---|:--:|\n| 1 | 2 |')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>strong</strong>')
    expect(html).toContain('href="guide.md"')
    expect(html).toContain('src="images/a.png"')
    expect(html).toContain('<table>')
    expect(html).not.toContain('<script')
  })

  it('maps Markdown, standalone HTML and optional annotation sidecar without pretending to zip', () => {
    const pkg = buildFormatPackage({
      sourceName: 'C:\\notes\\plan.markdown', markdown: '# Plan',
      annotations: { version: 1, documentKey: 'C:/notes/plan.md', annotations: [], excerpts: [], updatedAt: 1 },
    })
    expect(pkg.entries.map((entry) => entry.path)).toEqual(['plan.md', 'plan.html', 'plan.mdreader.json'])
    expect(pkg.manifest).toEqual({ version: 1, sourceName: 'plan.md', annotationSidecar: 'plan.mdreader.json' })
    expect(pkg.entries[2].content).toContain('"documentKey"')
    expect(pkg.entries[2].content).toContain('"schema": "md-reader.annotation-sidecar"')
  })

  it('makes stable safe emitted basenames', () => {
    expect(normalizeBaseName('')).toBe('document')
    expect(normalizeBaseName('/a/b/readme.MD')).toBe('readme')
  })
})
