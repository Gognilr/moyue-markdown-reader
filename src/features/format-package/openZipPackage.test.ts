import { describe, expect, it } from 'vitest'
import { buildOpenZipPackage, readZipDirectoryNames, safeRelativeZipPath } from './openZipPackage'

describe('open ZIP format package', () => {
  it('creates a standard store ZIP with explicit editable contents', () => {
    const pkg = buildOpenZipPackage({
      sourceName: 'C:/notes/plan.md', markdown: '# Plan',
      resources: [{ path: 'images/chart.png', content: new Uint8Array([137, 80, 78, 71]), mediaType: 'image/png' }],
      theme: { name: 'wide reading', css: 'body { max-width: 72ch; }' },
      annotations: { version: 1, documentKey: 'C:/notes/plan.md', annotations: [], excerpts: [], updatedAt: 1 },
    })
    expect([...pkg.archive.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    expect(pkg.fileName).toBe('plan.mdpack.zip')
    expect(readZipDirectoryNames(pkg.archive)).toEqual([
      'manifest.json', 'document/plan.md', 'document/plan.html', 'resources/images/chart.png',
      'themes/wide-reading.css', 'annotations/plan.mdreader.json',
    ])
    expect(pkg.manifest.resources).toEqual([{ path: 'resources/images/chart.png', mediaType: 'image/png' }])
  })

  it('rejects resource traversal, absolute paths and empty segments', () => {
    for (const unsafe of ['../secret.png', '/root/secret.png', 'C:/secret.png', 'images//secret.png', 'images/../secret.png']) {
      expect(() => safeRelativeZipPath(unsafe)).toThrow('Unsafe package resource path')
    }
    expect(safeRelativeZipPath(String.raw`images\chart.png`)).toBe('images/chart.png')
  })
})
