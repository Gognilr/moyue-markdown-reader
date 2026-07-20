import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from './markdownToIr'
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from 'pdf-lib'
import { createPdfBlob, planPdfExport, type PdfTextLine } from './pdfExport'
import { getExportTemplate } from './exportTemplates'
import { describeTable, emptyTableStudioSidecar, withColumnWidth } from './tableStudio'
import type { TableIR } from './documentIr'

describe('PDF export plan', () => {
  it('splits long content across real planned pages', () => {
    const plan = planPdfExport(markdownToDocumentIR(Array.from({ length: 140 }, (_, i) => `Line ${i}`).join('\n\n')))
    expect(plan.pages.length).toBeGreaterThan(1)
    expect(plan.pages.every((page) => page.items.length > 0)).toBe(true)
  })

  it('consumes Smart Table Studio sidecar widths in the PDF layout plan', () => {
    const ir = markdownToDocumentIR('| Name | Long explanation |\n| --- | --- |\n| A | export-specific width |')
    const table = ir.blocks.find((block): block is TableIR => block.kind === 'table')!
    const sidecar = withColumnWidth(emptyTableStudioSidecar(), describeTable(table), 1, 48, 2)
    const plan = planPdfExport(ir, { tableStudio: sidecar })
    const row = plan.pages[0].items.find((item) => item.kind === 'table')

    expect(row?.widths[1]).toBeGreaterThan(row?.widths[0] ?? Infinity)
    expect(ir.blocks).toHaveLength(1)
  })

  it('plans selectable table text and repeats the header after a page break', () => {
    const markdown = `| Name | Total |\n| --- | ---: |\n${Array.from({ length: 90 }, (_, i) => `| item ${i} | ${i} |`).join('\n')}`
    const plan = planPdfExport(markdownToDocumentIR(markdown))
    const tables = plan.pages.flatMap((page) => page.items.filter((item) => item.kind === 'table'))
    expect(tables.filter((item) => item.header)).toHaveLength(plan.pages.length)
    expect(tables.find((item) => !item.header)?.cells[0][0]).toBe('item 0')
  })

  it('creates an actual PDF blob rather than a renamed text file', async () => {
    const blob = await createPdfBlob(markdownToDocumentIR('# Report\n\nSelectable table content'))
    expect(blob.type).toBe('application/pdf')
    expect(new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer())).toBe('%PDF-')
    await expect(PDFDocument.load(await blob.arrayBuffer())).resolves.toBeInstanceOf(PDFDocument)
  })

  it('preserves Markdown external links as discoverable PDF URI annotations', async () => {
    const blob = await createPdfBlob(markdownToDocumentIR('[Project site](https://example.com/docs)'))
    const pdf = await PDFDocument.load(await blob.arrayBuffer())
    const annotations = pdf.getPages().flatMap((page) => {
      const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
      return annots ? annots.asArray() : []
    })

    expect(annotations).toHaveLength(1)
    const annotation = pdf.context.lookup(annotations[0], PDFDict)
    const action = annotation.lookup(PDFName.of('A'), PDFDict)
    expect(action.lookup(PDFName.of('S'), PDFName).asString()).toBe('/URI')
    expect(action.lookup(PDFName.of('URI'), PDFString).decodeText()).toBe('https://example.com/docs')
  })

  it('applies the selected export template to the PDF plan without changing source IR', () => {
    const ir = markdownToDocumentIR('# 标题\n\n正文')
    const official = getExportTemplate('chinese-official')
    const plan = planPdfExport(ir, { template: official })

    expect(plan.appliedTemplate).toEqual({
      id: 'chinese-official',
      bodySizePt: 12,
      lineHeight: 1.8,
      accent: 'A61B1B',
      page: 'a4',
    })
    expect(plan.pages[0].items.find((item) => item.kind === 'text' && item.style === 'body')).toMatchObject({ size: 12 })
    expect(ir.blocks[1]).toMatchObject({ kind: 'paragraph', children: [{ kind: 'text', value: '正文' }] })
  })

  it('preserves Chinese when a CJK font is available and plans embedded images plus landscape wide tables', () => {
    const table = `| ${Array.from({ length: 8 }, (_, index) => `列${index + 1}`).join(' | ')} |\n| ${Array.from({ length: 8 }, () => '---').join(' | ')} |\n| ${Array.from({ length: 8 }, (_, index) => `值${index + 1}`).join(' | ')} |`
    const ir = markdownToDocumentIR(`# 中文标题\n\n![架构图](assets/architecture.png)\n\n${table}`)
    const plan = planPdfExport(ir, {
      cjkFontBytes: new Uint8Array([1]),
      images: { 'assets/architecture.png': { bytes: new Uint8Array([1]), mimeType: 'image/png', width: 800, height: 400 } },
    })
    expect(plan.substitutedCharacters).toBe(0)
    expect(plan.pages[0].items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', text: '中文标题' }),
      expect.objectContaining({ kind: 'image', url: 'assets/architecture.png' }),
    ]))
    expect(plan.pageSize.width).toBeGreaterThan(plan.pageSize.height)
  })

  it('wraps CJK body text inside the printable right boundary', () => {
    const template = getExportTemplate('chinese-official')
    const paragraph = '中文导出必须在页面右边距之前换行，不能按英文平均字符宽度估算。'.repeat(12)
    const plan = planPdfExport(markdownToDocumentIR(paragraph), { template, cjkFontBytes: new Uint8Array([1]) })
    const lines = plan.pages.flatMap((page) => page.items.filter((item): item is PdfTextLine => item.kind === 'text' && item.style === 'body'))
    const rightBoundary = plan.pageSize.width - template.tokens.page.marginsPt.right

    expect(lines.length).toBeGreaterThan(2)
    expect(lines.every((line) => line.x + [...line.text].length * line.size <= rightBoundary + .01)).toBe(true)
  })

  it('keeps normal rows atomic and explicitly continues only a row taller than one printable page', () => {
    const oversized = Array.from({ length: 1_200 }, (_, index) => `word${index}`).join(' ')
    const plan = planPdfExport(markdownToDocumentIR(`| Narrative | Value |\n| --- | --- |\n| ${oversized} | x |\n| short row | y |`))
    const tables = plan.pages.flatMap((page) => page.items.filter((item) => item.kind === 'table'))
    const continuations = tables.filter((item) => item.pagination === 'continuation')

    expect(plan.tablePaginationNotices).toEqual([expect.objectContaining({ tableIndex: 0, rowIndex: 0, message: expect.stringContaining('continued') })])
    expect(continuations.length).toBeGreaterThan(1)
    expect(continuations.every((item) => item.continuation?.total === continuations.length)).toBe(true)
    // The normal final row still occurs once as one row, rather than being split.
    expect(tables.filter((item) => !item.header && item.pagination === 'keep-together')).toHaveLength(1)
    // Each continuation page starts with the original header; the trailing
    // short row may share the final continuation page or start a new one.
    expect(tables.filter((item) => item.header).length).toBeGreaterThanOrEqual(continuations.length)
    expect(plan.pages.filter((page) => page.items.some((item) => item.kind === 'table' && item.pagination === 'continuation')).every((page) => page.items.some((item) => item.kind === 'table' && item.header))).toBe(true)
  })
})
