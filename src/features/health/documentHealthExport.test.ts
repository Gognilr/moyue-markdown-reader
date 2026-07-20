import { describe, expect, it } from 'vitest'
import { buildDocumentHealthExport, downloadDocumentHealthExport } from './documentHealthExport'

describe('document health export', () => {
  const report = {
    checkedAt: 123,
    diagnostics: [{ id: 'missing-image', code: 'missing-local-resource' as const, severity: 'warning' as const, line: 4, column: 1, description: 'Missing image', fixHint: 'Restore it', resolution: 'pending' as const }],
  }

  it('exports only the document basename and the displayed diagnostic snapshot', () => {
    const file = buildDocumentHealthExport('C:\\private\\notes\\guide.md', report)
    expect(file).toMatchObject({ path: 'guide.health.json', mediaType: 'application/json' })
    expect(file.content).not.toContain('C:\\private')
    expect(JSON.parse(file.content)).toEqual({
      format: 'md-reader.document-health', version: 1, sourceName: 'guide.md', checkedAt: 123,
      diagnostics: report.diagnostics,
    })
  })

  it('uses the supplied transport for a single JSON file', async () => {
    const files: string[] = []
    await downloadDocumentHealthExport('guide.md', report, { download: (file) => { files.push(`${file.path}:${file.mediaType}`) } })
    expect(files).toEqual(['guide.health.json:application/json'])
  })
})
