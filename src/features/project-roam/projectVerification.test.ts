import { describe, expect, it } from 'vitest'
import { verifyProjectDocuments } from './projectVerification'

describe('injected project link verification', () => {
  it('reports supplied broken links, missing images, duplicate anchors and isolated documents', () => {
    const report = verifyProjectDocuments([
      { path: 'E:\\repo\\README.md', markdown: '# Start\n[Guide](docs/guide.md#missing)\n[Gone](gone.md)\n![Logo](assets/logo.png)\n## Same\n## Same' },
      { path: 'E:\\repo\\docs\\guide.md', markdown: '# Guide' },
      { path: 'E:\\repo\\notes.md', markdown: '# Notes' },
    ], { resourceInventory: { 'E:\\repo\\assets\\logo.png': { exists: false } } })
    expect(report.diagnostics.map((item) => item.code).sort()).toEqual(['broken-document-anchor', 'broken-document-link', 'duplicate-anchor', 'isolated-document', 'missing-image'])
  })

  it('keeps unknown resources non-failing and makes a deterministic README-first reading order', () => {
    const report = verifyProjectDocuments([
      { path: '/repo/docs/b.md', markdown: '# B' },
      { path: '/repo/README.md', markdown: '# Home\n[A](docs/a.md)' },
      { path: '/repo/docs/a.md', markdown: '# A\n[B](b.md)' },
      { path: '/repo/appendix.md', markdown: '# Appendix\n![unknown](image.png)' },
    ])
    expect(report.diagnostics.some((item) => item.code === 'missing-image')).toBe(false)
    expect(report.recommendedReadingOrder.map((item) => [item.path, item.reason])).toEqual([
      ['/repo/README.md', 'entry'], ['/repo/docs/a.md', 'linked-from'], ['/repo/docs/b.md', 'linked-from'], ['/repo/appendix.md', 'unlinked'],
    ])
  })

  it('uses explicit entry documents when a host supplies them', () => {
    const report = verifyProjectDocuments([
      { path: '/repo/README.md', markdown: '# Home' }, { path: '/repo/runbook.md', markdown: '# Runbook' },
    ], { entryPaths: ['/repo/runbook.md'] })
    expect(report.recommendedReadingOrder[0]).toMatchObject({ path: '/repo/runbook.md', reason: 'entry' })
  })
})
