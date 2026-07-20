import { inflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from './markdownToIr'
import { createDocxBlob, planDocxExport } from './docxExport'
import { describeTable, emptyTableStudioSidecar, withColumnWidth } from './tableStudio'
import type { TableIR } from './documentIr'
import { getExportTemplate } from './exportTemplates'

describe('DOCX export plan', () => {
  it('plans native Word structures for headings, lists, code and editable tables', () => {
    const plan = planDocxExport(markdownToDocumentIR(`# Report\n\nBody\n\n1. first\n2. second\n\n\`\`\`ts\nconst x = 1\n\`\`\`\n\n| Name | Total |\n| --- | ---: |\n| A | 12 |`))

    expect(plan.blocks).toEqual([
      { kind: 'heading', level: 1, text: 'Report' },
      { kind: 'paragraph', text: 'Body' },
      { kind: 'list', ordered: true, items: 2 },
      { kind: 'code', language: 'ts', text: 'const x = 1' },
      expect.objectContaining({ kind: 'table', columns: 2, rows: 2 }),
    ])
    const table = plan.blocks.at(-1)
    expect(table && table.kind === 'table' && table.widths.reduce((sum, width) => sum + width, 0)).toBe(9360)
    expect(table).toMatchObject({
      kind: 'table',
      pagination: { headerRepeat: true, cantSplitOrdinaryRows: true, oversizedRowFallback: 'continue-across-pages' },
    })
  })

  it('consumes Smart Table Studio sidecar widths without changing the source IR', () => {
    const ir = markdownToDocumentIR('| Name | Long explanation |\n| --- | --- |\n| A | export-specific width |')
    const table = ir.blocks.find((block): block is TableIR => block.kind === 'table')!
    const sidecar = withColumnWidth(emptyTableStudioSidecar(), describeTable(table), 1, 48, 2)
    const plan = planDocxExport(ir, { tableStudio: sidecar })
    const widths = (plan.blocks.find((block) => block.kind === 'table') as Extract<typeof plan.blocks[number], { kind: 'table' }>).widths

    expect(widths[1]).toBeGreaterThan(widths[0])
    expect(ir.blocks).toHaveLength(1)
  })

  it('writes an explicit template cover plus Word header/footer relationships', async () => {
    const blob = await createDocxBlob(markdownToDocumentIR('# 正文\n\n内容'), {
      template: getExportTemplate('technical-report'),
      metadata: { title: '导出契约', subtitle: '可编辑 Word', version: 'v2.0', author: '测试人', date: '2026-07-18' },
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const documentXml = decodeDocxEntry(bytes, 'word/document.xml')
    const headerXml = decodeDocxEntry(bytes, 'word/header1.xml')
    const footerXml = decodeDocxEntry(bytes, 'word/footer1.xml')

    expect(documentXml).toContain('导出契约')
    expect(documentXml).toContain('可编辑 Word')
    expect(documentXml).toContain('<w:sectPr>')
    expect(headerXml).toContain('导出契约 · v2.0')
    expect(footerXml).toContain('导出契约 · ')
    expect(footerXml).toContain('PAGE')
  })

  it('embeds supplied local logo bytes on a cover without loading a remote URL', async () => {
    // A 1×1 PNG fixture: the exporter receives bytes after the UI has resolved
    // an explicit front-matter path through Tauri's granted asset URL.
    const logo = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8igAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))
    const blob = await createDocxBlob(markdownToDocumentIR('# 正文'), {
      template: getExportTemplate('technical-report'),
      metadata: { title: '带 Logo 的导出', logo: { source: 'assets/company-logo.png', alt: '测试公司标识', data: logo, type: 'png' } },
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(decodeDocxEntry(bytes, 'word/document.xml')).toContain('pic:pic')
    expect(decodeDocxEntry(bytes, '[Content_Types].xml')).toContain('image/png')
  })

  it('embeds a resolved Markdown body image and uses landscape for an eight-column table', async () => {
    const image = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL8igAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))
    const table = `| ${Array.from({ length: 8 }, (_, index) => `列${index + 1}`).join(' | ')} |\n| ${Array.from({ length: 8 }, () => '---').join(' | ')} |\n| ${Array.from({ length: 8 }, (_, index) => `值${index + 1}`).join(' | ')} |`
    const blob = await createDocxBlob(markdownToDocumentIR(`![架构图](assets/architecture.png)\n\n${table}`), {
      imageResolver: async () => ({ bytes: image, mimeType: 'image/png', width: 1, height: 1 }),
    })
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const xml = decodeDocxEntry(bytes, 'word/document.xml')
    expect(xml).toContain('pic:pic')
    expect(xml).toContain('架构图')
    expect(xml).toContain('w:orient="landscape"')
    expect(xml).toContain('w:w="12960"')
  })

  it('appends sidecar annotations as a separate review appendix', async () => {
    const blob = await createDocxBlob(markdownToDocumentIR('# 正文\n\n原文内容'), {
      reviewAppendix: {
        documentTitle: '方案',
        annotations: [{ id: 'a1', kind: 'note', anchor: { quote: '待确认', prefix: '', suffix: '', headingPath: ['风险'] }, note: '请负责人确认', createdAt: 1, updatedAt: 1 }],
        excerpts: [{ id: 'e1', content: '关键结论', anchor: { quote: '关键结论', prefix: '', suffix: '', headingPath: ['结论'] }, createdAt: 1 }],
      },
    })
    const documentXml = decodeDocxEntry(new Uint8Array(await blob.arrayBuffer()), 'word/document.xml')
    expect(documentXml).toContain('原文内容')
    expect(documentXml).toContain('审阅记录')
    expect(documentXml).toContain('请负责人确认')
    expect(documentXml).toContain('关键结论')
  })
})

/** Minimal central-directory reader: enough to verify actual generated OOXML. */
function decodeDocxEntry(bytes: Uint8Array, entryName: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let eocd = -1
  for (let index = bytes.length - 22; index >= Math.max(0, bytes.length - 65_557); index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) { eocd = index; break }
  }
  if (eocd < 0) throw new Error('DOCX ZIP end-of-central-directory not found')
  const entries = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  for (let index = 0; index < entries; index += 1) {
    const compression = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    cursor += 46 + nameLength + extraLength + commentLength
    if (name !== entryName) continue
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    return decoder.decode(compression === 0 ? compressed : new Uint8Array(inflateRawSync(compressed)))
  }
  throw new Error(`DOCX entry not found: ${entryName}`)
}
