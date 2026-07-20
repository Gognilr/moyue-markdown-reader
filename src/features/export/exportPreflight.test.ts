import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from './markdownToIr'
import { preflightExport } from './exportPreflight'
import { applyExportOnlyResolutions, canProceedWithExport, createPreflightResolutionState, setExportOnlyChoice } from './exportPreflightResolution'

describe('export preflight', () => {
  it('classifies missing local resources as deterministic blockers', () => {
    const report = preflightExport(markdownToDocumentIR('![diagram](missing.png)'), { hasLocalResource: () => false })
    expect(report.canExport).toBe(false)
    expect(report.confidence).toBe('C')
    expect(report.issues[0]).toMatchObject({ kind: 'missingResource', severity: 'blocking', resource: 'missing.png' })
  })

  it('blocks a verified empty local image without claiming to decode it', () => {
    const report = preflightExport(markdownToDocumentIR('![diagram](assets/diagram.png)'), {
      resourceInventory: { 'assets/diagram.png': { exists: true, byteLength: 0 } },
    })
    expect(report).toMatchObject({ canExport: false, confidence: 'C' })
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'unreadableImage', severity: 'blocking', resource: 'assets/diagram.png', disposition: 'cannotGuarantee' }),
    ]))
  })

  it('reports remote resources, wide tables, and source HTML with fixes', () => {
    const markdown = `![remote](https://example.com/image.png)\n\n<div>legacy</div>\n\n| one | two | three | four | five | six |\n| --- | --- | --- | --- | --- | --- |\n| long value | long value | long value | long value | long value | long value |`
    const report = preflightExport(markdownToDocumentIR(markdown), { sourceMarkdown: markdown, tableLayout: { availableWidth: 30 } })
    expect(report.issues.map((entry) => entry.kind)).toEqual(expect.arrayContaining(['remoteResource', 'wideTable', 'unsupportedHtml']))
    expect(report.issues.every((entry) => entry.suggestedFix.length > 0)).toBe(true)
  })

  it('does not require a resource inventory for ordinary local content', () => {
    const report = preflightExport(markdownToDocumentIR('# Ready\n\n![local](images/a.png)'))
    expect(report).toMatchObject({ canExport: true, issues: [], confidence: 'A' })
    expect(report.evidence.join(' ')).toContain('未执行 Word')
    expect(report.downgradeReasons).toEqual([])
  })

  it('assigns the three export-only handling states', () => {
    const markdown = '![missing](lost.png)\n\n![remote](https://example.com/a.png)\n\n<div>legacy</div>'
    const report = preflightExport(markdownToDocumentIR(markdown), { sourceMarkdown: markdown, hasLocalResource: () => false })
    expect(report.issues.map((item) => item.disposition)).toEqual(expect.arrayContaining(['cannotGuarantee', 'needsChoice']))
    expect(report.confidence).toBe('C')
  })

  it('can undo an automatic repair and applies choices only to an export copy', () => {
    const source = '![remote](https://example.com/a.png)\n\n[site](https://example.com/docs)'
    const document = markdownToDocumentIR(source)
    const originalDocument = JSON.stringify(document)
    const report = preflightExport(document)
    const remoteIssues = report.issues.filter((item) => item.kind === 'remoteResource')
    let state = createPreflightResolutionState(report)
    expect(canProceedWithExport(report, state)).toBe(false)
    for (const issue of remoteIssues) state = setExportOnlyChoice(state, issue.id, 'omit')
    expect(canProceedWithExport(report, state)).toBe(true)
    const copy = applyExportOnlyResolutions(document, report, state)
    expect(copy).not.toBe(document)
    expect(copy.blocks.some((block) => block.kind === 'image')).toBe(false)
    expect(JSON.stringify(document)).toBe(originalDocument)
    expect(report.downgradeReasons).toEqual(expect.arrayContaining([expect.stringContaining('远程')]))
  })
})
