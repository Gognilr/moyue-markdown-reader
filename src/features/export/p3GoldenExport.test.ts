import { readFile } from 'node:fs/promises'
import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createDocxBlob, planDocxExport } from './docxExport'
import { markdownToDocumentIR } from './markdownToIr'
import { createPdfBlob, planPdfExport } from './pdfExport'
import { preflightExport } from './exportPreflight'

const fixture = new URL('../../../test/fixtures/export/p3-golden-mixed-content.md', import.meta.url)

async function goldenMarkdown() {
  return readFile(fixture, 'utf8')
}

/** Reads only the requested entry from a regular ZIP central directory. */
function zipEntry(bytes: Uint8Array, entryName: string): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break }
  }
  if (eocd < 0) throw new Error('ZIP end-of-central-directory not found')
  const entries = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  for (let index = 0; index < entries; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Malformed ZIP central directory')
    const compression = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength
    if (name !== entryName) continue
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Error('ZIP local header not found')
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    return compression === 0 ? compressed : new Uint8Array(inflateRawSync(compressed))
  }
  throw new Error(`ZIP entry not found: ${entryName}`)
}

describe('P3 golden export regression fixture', () => {
  it('keeps Chinese/mixed content, math, code, resources and a 50-row eight-column table in shared IR', async () => {
    const markdown = await goldenMarkdown()
    const ir = markdownToDocumentIR(markdown)
    const table = ir.blocks.find((block) => block.kind === 'table')

    expect(ir.blocks.map((block) => block.kind)).toEqual(expect.arrayContaining(['heading', 'paragraph', 'list', 'code', 'math', 'table']))
    expect(table?.kind).toBe('table')
    if (table?.kind === 'table') {
      expect(table.header.cells).toHaveLength(8)
      expect(table.rows).toHaveLength(50)
    }
    expect(markdown).toContain('Markdown 阅读器')
    expect(markdown).toContain('https://example.com/export-figure.png')
  })

  it('plans editable DOCX table dimensions and emits WordprocessingML table, code and text structures', async () => {
    const ir = markdownToDocumentIR(await goldenMarkdown())
    const plan = planDocxExport(ir)
    const table = plan.blocks.find((block) => block.kind === 'table')
    expect(table).toMatchObject({ kind: 'table', columns: 8, rows: 51 })
    expect(table && table.kind === 'table' && table.widths.reduce((sum, width) => sum + width, 0)).toBe(9360)

    const blob = await createDocxBlob(ir)
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe('PK')
    const xml = new TextDecoder().decode(zipEntry(bytes, 'word/document.xml'))
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('<w:tblHeader')
    expect(xml).toContain('<w:cantSplit/>')
    expect(xml).toContain('Markdown 阅读器')
    expect(xml).toContain('npm run build')
  })

  it('creates a multi-page PDF plan with repeated table headers and reports its current CJK substitution limit', async () => {
    const ir = markdownToDocumentIR(await goldenMarkdown())
    const plan = planPdfExport(ir)
    const tableRows = plan.pages.flatMap((page) => page.items.filter((item) => item.kind === 'table'))
    expect(plan.pages.length).toBeGreaterThan(1)
    expect(tableRows.filter((item) => item.header).length).toBeGreaterThan(1)
    expect(plan.substitutedCharacters).toBeGreaterThan(0)

    const blob = await createPdfBlob(ir)
    expect(blob.type).toBe('application/pdf')
    expect(new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())).toBe('%PDF-')
  })

  it('preflights known local resources and reports remote-resource plus wide-table risks without silent failure', async () => {
    const markdown = await goldenMarkdown()
    const report = preflightExport(markdownToDocumentIR(markdown), {
      sourceMarkdown: markdown,
      hasLocalResource: (url) => url === './assets/architecture.png' || url === './design.md',
      tableLayout: { availableWidth: 40 },
    })
    expect(report.canExport).toBe(true)
    expect(report.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(['remoteResource', 'wideTable', 'unsupportedHtml']))
    expect(report.issues.every((issue) => issue.suggestedFix.length > 0)).toBe(true)
  })
})
