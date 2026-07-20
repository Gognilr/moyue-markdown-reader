import { describe, expect, it } from 'vitest'
import { checkDocumentHealth, LARGE_IMAGE_BYTE_COUNT, WIDE_TABLE_COLUMN_COUNT } from './documentHealth'

describe('document health checks', () => {
  it('reports source-located structural and resource diagnostics without I/O', () => {
    const report = checkDocumentHealth([
      '# Start', '', '### Skipped level', '', '# Start', '',
      '![local](assets/chart.png)', '[guide](docs/guide.md)', '[cdn](https://example.com/a)', '',
      '| a | b | c | d | e | f | g | h | i |',
      '| - | - | - | - | - | - | - | - | - |',
      '| 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |',
    ].join('\n'))

    expect(report.diagnostics.map((item) => item.code)).toEqual([
      'heading-level-jump', 'duplicate-anchor', 'relative-image', 'relative-link', 'remote-resource', 'wide-table',
    ])
    expect(report.diagnostics[2]).toMatchObject({ line: 7, resolution: 'pending' })
    expect(report.diagnostics.every((item) => item.description && item.fixHint && item.line > 0)).toBe(true)
  })

  it('does not mistake absolute paths, fragments, or normal tables for unresolved resources', () => {
    const report = checkDocumentHealth('[jump](#part) ![root](/images/logo.svg)\n\n| a | b |\n| - | - |\n| 1 | 2 |')
    expect(report.diagnostics).toEqual([])
    expect(WIDE_TABLE_COLUMN_COUNT).toBeGreaterThan(2)
  })

  it('uses only injected resource metadata for local resource and large-image findings', () => {
    const report = checkDocumentHealth('![diagram](assets/diagram.png)\n![lost](assets/lost.png)', {
      resourceInventory: {
        'assets/diagram.png': { exists: true, byteLength: LARGE_IMAGE_BYTE_COUNT + 1, width: 5000, height: 4000 },
        'assets/lost.png': { exists: false },
      },
    })
    expect(report.diagnostics.map((item) => item.code)).toEqual([
      'oversized-image', 'relative-image', 'missing-local-resource',
    ])
    expect(report.diagnostics[0]).toMatchObject({ resolution: 'resolved', line: 1 })
    expect(report.diagnostics[1]).toMatchObject({ resolution: 'resolved' })
    expect(report.diagnostics[2].description).toContain('supplied resource inventory')
  })

  it('reports only explicit decoder and export constraints without pretending to inspect a file or font', () => {
    const report = checkDocumentHealth('<aside>note</aside>\n\n[ref]: https://example.com\n\n中文', {
      encoding: { suspicious: true, detectedLabel: 'GB18030', reason: 'replacement character observed', line: 3 },
      export: { font: { name: 'ASCII test font', supportedCharacters: 'note ref' }, checkUnsupportedSyntax: true },
    })
    expect(report.diagnostics.map((item) => item.code)).toEqual([
      'suspicious-encoding', 'export-font-coverage', 'unsupported-export-syntax', 'unsupported-export-syntax',
    ])
    expect(report.diagnostics[0]).toMatchObject({ line: 3 })
    expect(report.diagnostics[1].description).toContain('ASCII test font')
  })
})
