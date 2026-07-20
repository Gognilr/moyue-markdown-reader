import { PDFArray, PDFDocument, PDFName, PDFString, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { inlineText, type BlockIR, type DocumentIR, type InlineIR, type TableIR } from './documentIr'
import { planStudioTable, type TableLayoutPresetSettings, type TableStudioSidecar } from './tableStudio'
import { TABLE_PAGINATION_POLICY, type TablePaginationNotice, type TableRowPagination } from './tablePagination'
import { getExportTemplate, type ExportTemplate } from './exportTemplates'
import { resolveTablePresentation } from './tablePresentation'
import { fileService, type ExportSaveResult } from '../../services/fileService'
import { fitImage, resolveExportImages, type ExportImageResolver, type ExportImageResource } from './exportImageResources'

/** Points, rather than CSS pixels: this keeps the browser download predictable. */
export interface PdfExportOptions {
  page?: 'a4' | 'letter'
  title?: string
  /** Standard PDF fonts are intentionally used so the generated blob has no server dependency. */
  font?: 'Helvetica' | 'Times-Roman'
  /** Presentation only.  It affects the generated PDF, never Markdown or IR. */
  template?: ExportTemplate
  /** Uses explicit gray fills while preserving table structure and text. */
  printMode?: 'color' | 'monochrome'
  /** Optional Smart Table Studio preferences, applied only to this export. */
  tableStudio?: TableStudioSidecar
  /** Optional document/type preset; a table-specific sidecar setting wins. */
  tablePreset?: TableLayoutPresetSettings
  sourcePath?: string
  imageResolver?: ExportImageResolver
  images?: Record<string, ExportImageResource>
  cjkFontBytes?: Uint8Array
  cjkFontResolver?: () => Promise<Uint8Array | null>
}

export interface AppliedPdfTemplateTokens {
  id: string
  bodySizePt: number
  lineHeight: number
  accent: string
  page: 'a4' | 'letter'
}

export interface PdfTextLine {
  kind: 'text'
  text: string
  x: number
  y: number
  size: number
  style: 'body' | 'heading' | 'code' | 'quote' | 'math'
  /** A preserved external destination; materialised as a PDF Link annotation. */
  link?: string
}

export interface PdfTableRow {
  kind: 'table'
  header: boolean
  cells: string[][]
  widths: number[]
  height: number
  /** Only an over-page-height source row is allowed to use continuation. */
  pagination: TableRowPagination
  continuation?: { part: number; total: number }
  /** Shared table presentation decisions, independent from PDF drawing. */
  style?: { stripe: boolean; summary: boolean; firstColumnEmphasis: boolean }
}

export interface PdfImageItem {
  kind: 'image'
  url: string
  alt: string
  x: number
  y: number
  width: number
  height: number
}

export type PdfPageItem = PdfTextLine | PdfTableRow | PdfImageItem
export interface PdfExportPage { items: PdfPageItem[] }
export interface PdfExportPlan {
  pageSize: { width: number; height: number }
  pages: PdfExportPage[]
  /** Present when source text cannot be encoded by PDF's built-in Latin font. */
  substitutedCharacters: number
  /** Explicit, non-silent fallback record for source rows taller than a page. */
  tablePaginationNotices: TablePaginationNotice[]
  /** Machine-readable evidence of the template tokens used for this export. */
  appliedTemplate: AppliedPdfTemplateTokens
}

const A4 = { width: 595.28, height: 841.89 }
const LETTER = { width: 612, height: 792 }

/**
 * Turns renderer-independent DocumentIR into deterministic page content.
 * The plan is intentionally serialisable, and is the contract tested without
 * asserting a binary PDF file.
 */
export function planPdfExport(ir: DocumentIR, options: PdfExportOptions = {}): PdfExportPlan {
  const template = options.template ?? getExportTemplate()
  const tokens = template.tokens
  const pageKind = options.page ?? tokens.page.size
  const basePageSize = pageKind === 'letter' ? LETTER : A4
  const landscape = tokens.page.allowLandscapeTables
    && ir.blocks.some((block) => block.kind === 'table' && block.header.cells.length >= 8)
  const pageSize = landscape ? { width: basePageSize.height, height: basePageSize.width } : basePageSize
  const marginX = tokens.page.marginsPt.left
  const marginY = tokens.page.marginsPt.top
  const bodySize = tokens.typography.bodySizePt
  const bodyLine = bodySize * tokens.typography.lineHeight
  const pages: PdfExportPage[] = [{ items: [] }]
  let page = pages[0]
  let y = pageSize.height - marginY
  let substitutedCharacters = 0
  const tablePaginationNotices: TablePaginationNotice[] = []
  let tableIndex = 0
  const contentWidth = pageSize.width - marginX - tokens.page.marginsPt.right
  const hasCjkFont = Boolean(options.cjkFontBytes)
  const safeText = (value: string) => hasCjkFont ? value : latinPdfText(value)
  const nextPage = () => { page = { items: [] }; pages.push(page); y = pageSize.height - marginY }
  const addLine = (text: string, size = bodySize, style: PdfTextLine['style'] = 'body', x = marginX, link?: string) => {
    const lineHeight = size * 1.42
    if (y - lineHeight < tokens.page.marginsPt.bottom && page.items.length) nextPage()
    const safe = safeText(text)
    if (!hasCjkFont) substitutedCharacters += countSubstitutions(text)
    page.items.push({ kind: 'text', text: safe, x, y, size, style, link })
    y -= lineHeight
  }
  const addGap = (height = tokens.typography.paragraphAfterPt) => { if (y - height < tokens.page.marginsPt.bottom && page.items.length) nextPage(); else y -= height }
  const addTable = (table: TableIR, tableIndex: number) => {
    const layout = planStudioTable(table, options.tableStudio ?? { version: 1, tables: {} }, { availableWidth: contentWidth }, tableIndex, options.tablePreset)
    const ratios = layout.columns.map((column) => column.assignedWidth)
    const total = ratios.reduce((sum, width) => sum + width, 0) || 1
    const widths = ratios.map((width) => contentWidth * width / total)
    const row = (cells: TableIR['header']['cells'], header: boolean, bodyIndex = 0): PdfTableRow => {
      const content = cells.map((cell, index) => wrapText(inlineText(cell.children), Math.max(8, widths[index] - 8), bodySize).map(safeText))
      if (!hasCjkFont) cells.forEach((cell) => { const source = inlineText(cell.children); substitutedCharacters += countSubstitutions(source) })
      return { kind: 'table', header, cells: content, widths, height: Math.max(...content.map((lines) => lines.length), 1) * bodyLine + 10, pagination: 'keep-together', style: { stripe: !header && bodyIndex % 2 === 1, summary: !header && isSummaryRow(cells) && tokens.table.summaryRowEmphasis, firstColumnEmphasis: tokens.table.firstColumnEmphasis } }
    }
    const presentation = resolveTablePresentation(table, tableIndex + 1)
    if (presentation.caption) { addGap(4); addLine(`表 ${presentation.number}：${presentation.caption}`, bodySize, 'heading') }
    const header = row(table.header.cells, true)
    const addRow = (item: PdfTableRow, repeatHeader = false) => {
      if (y - item.height < tokens.page.marginsPt.bottom && page.items.length) {
        nextPage()
        if (repeatHeader) { page.items.push(header); y -= header.height }
      }
      page.items.push(item)
      y -= item.height
    }
    let tableStarted = false
    table.rows.forEach((body, rowIndex) => {
      const item = row(body.cells, false, rowIndex)
      // A regular row is never split.  If it is too tall to fit on an empty
      // printable page, continuation fragments are the documented fallback.
      const printableHeight = pageSize.height - marginY - tokens.page.marginsPt.bottom - header.height
      if (item.height <= printableHeight) {
        if (!tableStarted) {
          // Do not leave a header alone at the bottom of the previous page.
          if (y - header.height - item.height < tokens.page.marginsPt.bottom && page.items.length) nextPage()
          addRow(header)
          tableStarted = true
        }
        addRow(item, TABLE_PAGINATION_POLICY.repeatHeader)
        return
      }
      tablePaginationNotices.push({
        tableIndex,
        rowIndex,
        message: `Table row ${rowIndex + 1} exceeds one printable page and was continued with repeated headers.`,
      })
      addOversizedTableRow(item, header, printableHeight, bodyLine, nextPage, () => page, (nextY) => { y = nextY }, () => y)
      tableStarted = true
    })
    if (!tableStarted) addRow(header)
    presentation.notes.forEach((text) => addLine(`注：${text}`, Math.max(8, bodySize - 1), 'quote'))
    presentation.sources.forEach((text) => addLine(`来源：${text}`, Math.max(8, bodySize - 1), 'quote'))
    addGap()
  }
  const addBlock = (block: BlockIR, indent = 0): void => {
    switch (block.kind) {
      case 'heading': {
        addGap(8)
        const size = bodySize * (tokens.typography.headingScale[block.depth - 1] ?? 1)
        wrapText(inlineText(block.children), contentWidth - indent, size).forEach((line) => addLine(line, size, 'heading', marginX + indent))
        addGap(4)
        return
      }
      case 'paragraph':
        wrapText(inlineText(block.children), contentWidth - indent, bodySize).forEach((line) => addLine(line, bodySize, 'body', marginX + indent))
        addGap()
        return
      case 'list':
        block.items.forEach((item, index) => {
          const prefix = block.ordered ? `${(block.start ?? 1) + index}. ` : `${item.checked === true ? '[x] ' : item.checked === false ? '[ ] ' : '- '}`
          item.blocks.forEach((child) => {
            if (child.kind === 'paragraph') {
              const lines = wrapText(inlineText(child.children), contentWidth - indent - 22, bodySize)
              lines.forEach((line, lineIndex) => addLine(`${lineIndex === 0 ? prefix : ' '.repeat(prefix.length)}${line}`, bodySize, 'body', marginX + indent))
            } else addBlock(child, indent + 18)
          })
        })
        addGap()
        return
      case 'blockquote':
        block.blocks.forEach((child) => addBlock(child, indent + 14))
        return
      case 'code':
        addGap(3)
        block.value.split('\n').forEach((line) => wrapText(line || ' ', contentWidth - indent - 8, tokens.code.fontSizePt, true)
          .forEach((wrapped) => addLine(wrapped, tokens.code.fontSizePt, 'code', marginX + indent + 8)))
        addGap(4)
        return
      case 'math': wrapText(block.value, contentWidth - indent - 18, bodySize + 1, true)
        .forEach((line) => addLine(line, bodySize + 1, 'math', marginX + indent + 18)); addGap(); return
      case 'thematicBreak': addLine('────────────────────────────────────────────────', 8, 'quote', marginX + indent); addGap(); return
      case 'image': {
        const image = options.images?.[block.url]
        if (!image || (image.mimeType !== 'image/png' && image.mimeType !== 'image/jpeg')) {
          addLine(`[Image unavailable: ${block.alt || block.url}]`, 10, 'quote', marginX + indent); addGap(); return
        }
        const size = fitImage(image.width, image.height, contentWidth - indent, 380)
        if (y - size.height < tokens.page.marginsPt.bottom && page.items.length) nextPage()
        page.items.push({ kind: 'image', url: block.url, alt: block.alt || block.url, x: marginX + indent, y, ...size })
        y -= size.height + tokens.typography.paragraphAfterPt
        return
      }
      case 'table': addTable(block, tableIndex++); return
    }
  }
  ir.blocks.forEach((block) => addBlock(block))
  const links = collectExternalLinks(ir.blocks)
  if (links.length) {
    addGap(8)
    addLine('External links', bodySize * 1.15, 'heading')
    links.forEach(({ label, url }) => wrapText(`${label}: ${url}`, contentWidth, Math.max(8, bodySize - 1))
      .forEach((line) => addLine(line, Math.max(8, bodySize - 1), 'quote', marginX, url)))
  }
  return { pageSize, pages, substitutedCharacters, tablePaginationNotices, appliedTemplate: { id: template.id, bodySizePt: bodySize, lineHeight: tokens.typography.lineHeight, accent: tokens.colors.accent, page: pageKind } }
}

/**
 * Breaks only an over-page-height row.  Every fragment is complete enough to
 * draw independently, and each continuation page receives the same header.
 */
function addOversizedTableRow(
  item: PdfTableRow,
  header: PdfTableRow,
  printableHeight: number,
  bodyLine: number,
  nextPage: () => void,
  currentPage: () => PdfExportPage,
  setY: (value: number) => void,
  getY: () => number,
) {
  const maxLines = Math.max(1, Math.floor((printableHeight - 10) / bodyLine))
  const sourceLines = Math.max(...item.cells.map((cell) => cell.length), 1)
  const parts = Math.ceil(sourceLines / maxLines)
  // Start a continuation on a clean page unless the existing page is empty.
  if (currentPage().items.length) nextPage()
  for (let part = 0; part < parts; part += 1) {
    if (part > 0) nextPage()
    const page = currentPage()
    page.items.push(header)
    let y = getY() - header.height
    const cells = item.cells.map((cell) => cell.slice(part * maxLines, (part + 1) * maxLines))
    const height = Math.max(...cells.map((cell) => cell.length), 1) * bodyLine + 10
    page.items.push({ ...item, cells, height, pagination: 'continuation', continuation: { part: part + 1, total: parts } })
    y -= height
    setY(y)
  }
}

/** Creates a real vector PDF with selectable text and drawn table rules. */
export async function createPdfBlob(ir: DocumentIR, options: PdfExportOptions = {}): Promise<Blob> {
  const images = options.images ?? await resolveExportImages(ir, options.sourcePath, options.imageResolver)
  let cjkFontBytes = options.cjkFontBytes
  if (!cjkFontBytes) {
    try { cjkFontBytes = await (options.cjkFontResolver ? options.cjkFontResolver() : fileService.readWindowsCjkFont()) ?? undefined } catch { /* Latin-only fallback remains explicit in the plan. */ }
  }
  const resolvedOptions = { ...options, images, cjkFontBytes }
  const plan = planPdfExport(ir, resolvedOptions)
  const document = await PDFDocument.create()
  document.setTitle(options.title ?? 'Markdown export')
  document.setProducer('Markdown Reader')
  document.setSubject('Accessible Markdown export with selectable text and external link annotations')
  let regular: PDFFont
  let bold: PDFFont
  if (cjkFontBytes) {
    document.registerFontkit(fontkit)
    regular = await document.embedFont(cjkFontBytes, { subset: true })
    bold = regular
  } else {
    regular = await document.embedFont(options.font === 'Times-Roman' ? StandardFonts.TimesRoman : StandardFonts.Helvetica)
    bold = await document.embedFont(options.font === 'Times-Roman' ? StandardFonts.TimesRomanBold : StandardFonts.HelveticaBold)
  }
  const embeddedImages = new Map<string, PDFImage>()
  for (const [url, image] of Object.entries(images)) {
    if (image.mimeType === 'image/png') embeddedImages.set(url, await document.embedPng(image.bytes))
    else if (image.mimeType === 'image/jpeg') embeddedImages.set(url, await document.embedJpg(image.bytes))
  }
  for (const source of plan.pages) {
    const page = document.addPage([plan.pageSize.width, plan.pageSize.height])
    let y = plan.pageSize.height - (options.template ?? getExportTemplate()).tokens.page.marginsPt.top
    source.items.forEach((item) => {
      if (item.kind === 'text') {
        drawText(page, item, item.style === 'heading' ? bold : regular, options.template ?? getExportTemplate())
        y = item.y - item.size * 1.42
      } else if (item.kind === 'table') {
        drawTableRow(page, item, y, regular, bold, options.template ?? getExportTemplate(), options.printMode ?? 'color')
        y -= item.height
      } else {
        const image = embeddedImages.get(item.url)
        if (image) page.drawImage(image, { x: item.x, y: item.y - item.height, width: item.width, height: item.height })
        y = item.y - item.height
      }
    })
    page.drawText(String(document.getPageCount()), { x: plan.pageSize.width / 2 - 4, y: 24, size: 8, font: regular, color: rgb(.38, .43, .5) })
  }
  const bytes = await document.save()
  // pdf-lib's typed-array buffer may be declared as ArrayBufferLike in newer TS;
  // it is a fresh ArrayBuffer produced by `save` in every supported browser.
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
}

/** Saves a PDF through the native picker, with a browser-download fallback. */
export async function downloadPdf(ir: DocumentIR, fileName = 'document.pdf', options: PdfExportOptions = {}): Promise<ExportSaveResult | null> {
  const blob = await createPdfBlob(ir, options)
  return fileService.saveExportFile(blob, fileName, 'pdf')
}

function drawText(page: PDFPage, line: PdfTextLine, font: PDFFont, template: ExportTemplate) {
  const color = hexColor(line.style === 'heading' ? template.tokens.colors.heading : line.style === 'code' ? template.tokens.colors.codeText : template.tokens.colors.text)
  const availableWidth = Math.max(8, page.getWidth() - template.tokens.page.marginsPt.right - line.x)
  const fittedSize = fitTextSize(font, line.text, line.size, availableWidth)
  const drawnWidth = Math.min(availableWidth, font.widthOfTextAtSize(line.text, fittedSize))
  if (line.style === 'code') page.drawRectangle({ x: line.x - 4, y: line.y - 3, width: Math.min(availableWidth + 4, Math.max(24, drawnWidth + 8)), height: fittedSize * 1.35, color: hexColor(template.tokens.colors.codeBackground) })
  page.drawText(line.text, { x: line.x, y: line.y, size: fittedSize, font, color })
  if (line.link) addUriAnnotation(page, line.link, line.x, line.y - 2, drawnWidth, fittedSize * 1.35)
}

function drawTableRow(page: PDFPage, row: PdfTableRow, y: number, regular: PDFFont, bold: PDFFont, template: ExportTemplate, printMode: 'color' | 'monochrome') {
  let x = template.tokens.page.marginsPt.left
  const fill = row.header ? (printMode === 'monochrome' ? 'D9D9D9' : template.tokens.colors.tableHeaderBackground)
    : row.style?.summary ? (printMode === 'monochrome' ? 'E7E7E7' : 'E2E8F0')
      : row.style?.stripe ? (printMode === 'monochrome' ? 'F5F5F5' : template.tokens.table.zebraStripeBackground)
        : undefined
  if (fill) page.drawRectangle({ x, y: y - row.height, width: row.widths.reduce((sum, width) => sum + width, 0), height: row.height, color: hexColor(fill) })
  row.cells.forEach((lines, index) => {
    const width = row.widths[index] ?? 0
    page.drawRectangle({ x, y: y - row.height, width, height: row.height, borderColor: hexColor(template.tokens.colors.tableBorder), borderWidth: template.tokens.table.borderWidthPt })
    lines.forEach((line, lineIndex) => {
      const font = row.header || row.style?.summary || (index === 0 && row.style?.firstColumnEmphasis) ? bold : regular
      const size = fitTextSize(font, line, template.tokens.typography.bodySizePt, Math.max(4, width - 8))
      page.drawText(line, { x: x + 4, y: y - 14 - lineIndex * (template.tokens.typography.bodySizePt * template.tokens.typography.lineHeight), size, font, color: hexColor(template.tokens.colors.text) })
    })
    x += width
  })
}

function isSummaryRow(cells: TableIR['header']['cells']): boolean {
  return /^(?:total|subtotal|grand total)\b|^(?:合计|总计|小计)/i.test(inlineText(cells[0]?.children ?? []).trim())
}

function wrapText(value: string, maxWidth: number, fontSize: number, monospace = false): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ['']
  const lines: string[] = []
  let current = ''
  let width = 0
  for (const character of normalized) {
    const characterWidth = estimatedGlyphWidth(character, fontSize, monospace)
    if (current && width + characterWidth > maxWidth) {
      lines.push(current.trimEnd())
      current = character === ' ' ? '' : character
      width = character === ' ' ? 0 : characterWidth
    } else {
      current += character
      width += characterWidth
    }
  }
  if (current) lines.push(current.trimEnd())
  return lines.length ? lines : ['']
}

function estimatedGlyphWidth(character: string, fontSize: number, monospace: boolean): number {
  if (monospace) return fontSize * .62
  if (/\s/.test(character)) return fontSize * .33
  if (character.codePointAt(0)! > 0xffff || /[\u2e80-\u9fff\uf900-\ufaff\uff01-\uff60\uffe0-\uffe6]/.test(character)) return fontSize
  if (/[iIl.,:;!'|]/.test(character)) return fontSize * .28
  if (/[MW@#%]/.test(character)) return fontSize * .85
  return fontSize * .56
}

function fitTextSize(font: PDFFont, text: string, preferredSize: number, maxWidth: number): number {
  const width = font.widthOfTextAtSize(text, preferredSize)
  return width > maxWidth && width > 0 ? preferredSize * maxWidth / width : preferredSize
}

function latinPdfText(value: string): string { return [...value].map((character) => character.codePointAt(0)! <= 255 ? character : '?').join('') }
function countSubstitutions(value: string): number { return [...value].filter((character) => character.codePointAt(0)! > 255).length }
function hexColor(value: string) { const normalized = value.replace('#', ''); return rgb(parseInt(normalized.slice(0, 2), 16) / 255, parseInt(normalized.slice(2, 4), 16) / 255, parseInt(normalized.slice(4, 6), 16) / 255) }

/**
 * The main renderer deliberately remains dependency-free and text-first.  A
 * compact link appendix makes every Markdown external link discoverable to
 * screen-reader users and preserves a real PDF URI annotation even when the
 * surrounding inline formatting is flattened into the drawing plan.
 */
function collectExternalLinks(blocks: BlockIR[]): Array<{ label: string; url: string }> {
  const found = new Map<string, string>()
  const visitInline = (children: InlineIR[]) => children.forEach((child) => {
    if (child.kind === 'link') {
      const label = inlineText(child.children).trim() || child.url
      if (!found.has(child.url)) found.set(child.url, label)
      visitInline(child.children)
    } else if ('children' in child) visitInline(child.children)
  })
  const visitBlocks = (items: BlockIR[]) => items.forEach((block) => {
    switch (block.kind) {
      case 'heading': case 'paragraph': visitInline(block.children); break
      case 'list': block.items.forEach((item) => visitBlocks(item.blocks)); break
      case 'blockquote': visitBlocks(block.blocks); break
      case 'table':
        block.header.cells.forEach((cell) => visitInline(cell.children))
        block.rows.forEach((row) => row.cells.forEach((cell) => visitInline(cell.children)))
        break
    }
  })
  visitBlocks(blocks)
  return [...found].map(([url, label]) => ({ url, label }))
}

function addUriAnnotation(page: PDFPage, url: string, x: number, y: number, width: number, height: number) {
  const annotation = page.doc.context.register(page.doc.context.obj({
    Type: 'Annot',
    Subtype: 'Link',
    Rect: [x, y, x + Math.max(width, 1), y + Math.max(height, 1)],
    Border: [0, 0, 0],
    A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) },
  }))
  const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray)
  if (annots) annots.push(annotation)
  else page.node.set(PDFName.of('Annots'), page.doc.context.obj([annotation]))
}
