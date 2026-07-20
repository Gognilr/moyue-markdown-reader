import { describe, expect, it } from 'vitest'
import { createXlsxBlob } from './xlsxExport'

describe('XLSX table export', () => {
  it('creates a standard workbook with Chinese text and the complete grid', async () => {
    const blob = await createXlsxBlob([['名称', '数值'], ['甲', '42'], ['乙', '17']], '验收/表')
    const { strFromU8, unzipSync } = await import('fflate')
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(strFromU8(files['xl/workbook.xml'])).toContain('sheet name="验收 表"')
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('<t xml:space="preserve">名称</t>')
    expect(sheet).toContain('<t xml:space="preserve">42</t>')
    expect(sheet).toContain('<t xml:space="preserve">乙</t>')
    expect(sheet).toContain('state="frozen"')
  })

  it('rejects an empty table', async () => {
    await expect(createXlsxBlob([])).rejects.toThrow('empty table')
  })
})
