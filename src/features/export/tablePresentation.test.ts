import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from './markdownToIr'
import { planDocxExport } from './docxExport'
import { planPdfExport } from './pdfExport'

describe('table export presentation', () => {
  const markdown = `表 7：季度交付情况

| 项目 | 数量 |
| --- | ---: |
| Alpha | 2 |
| Beta | 3 |
| 合计 | 5 |

注：数量为已验收条目。

来源：项目台账，2026-07-16。`

  it('moves only explicit caption, note and source markers next to a table in shared IR', () => {
    const ir = markdownToDocumentIR(markdown)
    const table = ir.blocks.find((block) => block.kind === 'table')
    expect(ir.blocks).toHaveLength(1)
    expect(table?.kind).toBe('table')
    if (table?.kind === 'table') expect(table.presentation).toEqual({ caption: '季度交付情况', notes: ['数量为已验收条目。'], sources: ['项目台账，2026-07-16。'] })
  })

  it('plans caption/narrative and row styles for DOCX/PDF without changing table cells', () => {
    const ir = markdownToDocumentIR(markdown)
    const docx = planDocxExport(ir)
    expect(docx.blocks).toEqual(expect.arrayContaining([{ kind: 'table', columns: 2, rows: 4, widths: expect.any(Array), pagination: expect.any(Object), presentation: { number: 1, caption: '季度交付情况', notes: ['数量为已验收条目。'], sources: ['项目台账，2026-07-16。'] }, rowStyle: { zebra: true, firstColumnEmphasis: true, summaryRowEmphasis: true } }]))
    const pdf = planPdfExport(ir, { printMode: 'monochrome' })
    const text = pdf.pages.flatMap((page) => page.items.filter((item) => item.kind === 'text').map((item) => item.text))
    const rows = pdf.pages.flatMap((page) => page.items.filter((item) => item.kind === 'table'))
    expect(text.some((item) => item.startsWith('? 1'))).toBe(true)
    expect(text.some((item) => item.includes('2026-07-16'))).toBe(true)
    expect(rows.find((row) => !row.header && row.style?.stripe)?.style?.firstColumnEmphasis).toBe(true)
    expect(rows.find((row) => !row.header && row.style?.summary)?.style?.summary).toBe(true)
  })
})
