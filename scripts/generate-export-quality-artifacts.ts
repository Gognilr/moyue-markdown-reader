import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { markdownToDocumentIR } from '../src/features/export/markdownToIr'
import { createDocxBlob } from '../src/features/export/docxExport'
import { createPdfBlob } from '../src/features/export/pdfExport'
import { getExportTemplate } from '../src/features/export/exportTemplates'

const output = resolve('test-artifacts/export-quality')
await mkdir(resolve(output, 'assets'), { recursive: true })

const headers = Array.from({ length: 12 }, (_, index) => `字段 ${index + 1}`)
const rows = Array.from({ length: 50 }, (_, row) => `| ${headers.map((_, column) => column === 1
  ? `第 ${row + 1} 行中文说明与 English text，用于验证换行和分页`
  : `${row + 1}-${column + 1}`).join(' | ')} |`).join('\n')
const markdown = `# DOCX / PDF 导出质量验收

中文字体必须可以复制和搜索；图片必须实际嵌入，不能显示占位符。

这是用于验证普通正文右边界的连续中文长段落。产品方向是成立的，技术主线也比较清晰，但导出结果必须在页面可用宽度内可靠换行，不能因为使用英文平均字符宽度估算而越过右侧页边距或被查看器裁切。该验证同时覆盖中文标点、中英文 mixed text 以及没有手工换行的长句，确保最终 PDF 在常见查看器中保持完整、清晰和可复制。

![Markdown 阅读器图标](assets/architecture.png "本地图片嵌入验收")

## 十二列宽表与五十行分页

| ${headers.join(' | ')} |
| ${headers.map(() => '---').join(' | ')} |
${rows}

## 代码与中英混排

\`\`\`ts
const message = '中文导出 / selectable text'
console.log(message)
\`\`\`

结论：图片、中文、宽表、重复表头和分页需要同时通过视觉检查。
`

const imageBytes = new Uint8Array(await readFile(resolve('src-tauri/icons/128x128.png')))
await writeFile(resolve(output, 'assets/architecture.png'), imageBytes)
await writeFile(resolve(output, 'export-quality-golden.md'), markdown, 'utf8')

const ir = markdownToDocumentIR(markdown)
const imageResolver = async () => ({ bytes: imageBytes, mimeType: 'image/png' as const, width: 128, height: 128 })
const template = getExportTemplate('technical-report')
const docx = await createDocxBlob(ir, {
  template,
  imageResolver,
  metadata: { title: '导出质量验收', subtitle: '图片、中文字体与宽表分页', version: '2026-07-19', author: 'Markdown Reader' },
})
await writeFile(resolve(output, 'export-quality-golden.docx'), new Uint8Array(await docx.arrayBuffer()))

const cjkFontBytes = new Uint8Array(await readFile('C:/Windows/Fonts/simhei.ttf'))
const pdf = await createPdfBlob(ir, { title: '导出质量验收', template, imageResolver, cjkFontBytes })
await writeFile(resolve(output, 'export-quality-golden.pdf'), new Uint8Array(await pdf.arrayBuffer()))

console.log(JSON.stringify({ output, markdownBytes: Buffer.byteLength(markdown), docxBytes: docx.size, pdfBytes: pdf.size }))
