import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Header,
  ImageRun,
  Packer,
  PageOrientation,
  PageNumber,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx'
import type { BlockIR, DocumentIR, InlineIR, TableIR } from './documentIr'
import { inlineText } from './documentIr'
import { planStudioTable, type TableLayoutPresetSettings, type TableStudioSidecar } from './tableStudio'
import { tablePaginationMetadata } from './tablePagination'
import { getExportTemplate, resolveExportPresentation, type ExportDocumentMetadata, type ExportTemplate } from './exportTemplates'
import { resolveTablePresentation } from './tablePresentation'
import type { ReviewExportData } from '../annotations/reviewExport'
import { fileService, type ExportSaveResult } from '../../services/fileService'
import { fitImage, resolveExportImages, type ExportImageResolver, type ExportImageResource } from './exportImageResources'

const PAGE_TEXT_WIDTH_DXA = 9360
const LANDSCAPE_TEXT_WIDTH_DXA = 12960

export interface DocxExportOptions {
  /** Presentation only: the source DocumentIR and Markdown are never mutated. */
  template?: ExportTemplate
  /** Printer-friendly styling; content and editable table structure are unchanged. */
  printMode?: 'color' | 'monochrome'
  /** Optional Smart Table Studio preferences, applied only to this export. */
  tableStudio?: TableStudioSidecar
  /** Optional document/type preset; a table-specific sidecar setting wins. */
  tablePreset?: TableLayoutPresetSettings
  /** Explicit export-only metadata for cover, header and footer content. */
  metadata?: ExportDocumentMetadata
  /** A separate review appendix from annotation sidecar data. */
  reviewAppendix?: ReviewExportData
  /** Absolute Markdown source path used only to resolve safe relative images. */
  sourcePath?: string
  /** Injectable resolver for browser tests and non-native hosts. */
  imageResolver?: ExportImageResolver
  /** Pre-resolved export resources; normally populated by createDocxBlob. */
  images?: Record<string, ExportImageResource>
}

interface DocxStyle {
  bodyFont: string
  headingFont: string
  codeFont: string
  bodySize: number
  paragraphAfter: number
  headingColor: string
  codeBackground: string
  tableHeaderBackground: string
  tableStripeBackground: string
  firstColumnEmphasis: boolean
  summaryRowEmphasis: boolean
  margins: { top: number; right: number; bottom: number; left: number }
}

function docxStyle(template: ExportTemplate | undefined): DocxStyle {
  const tokens = (template ?? getExportTemplate()).tokens
  return {
    bodyFont: tokens.fonts.body[0] ?? 'Arial',
    headingFont: tokens.fonts.heading[0] ?? 'Arial',
    codeFont: tokens.fonts.code[0] ?? 'Consolas',
    // docx uses half-points.
    bodySize: Math.round(tokens.typography.bodySizePt * 2),
    paragraphAfter: Math.round(tokens.typography.paragraphAfterPt * 20),
    headingColor: tokens.colors.heading,
    codeBackground: tokens.colors.codeBackground,
    tableHeaderBackground: tokens.colors.tableHeaderBackground,
    tableStripeBackground: tokens.table.zebraStripeBackground,
    firstColumnEmphasis: tokens.table.firstColumnEmphasis,
    summaryRowEmphasis: tokens.table.summaryRowEmphasis,
    // OOXML page margins use twips; tokens deliberately remain in points.
    margins: Object.fromEntries(Object.entries(tokens.page.marginsPt).map(([key, value]) => [key, Math.round(value * 20)])) as DocxStyle['margins'],
  }
}

/**
 * A serialisable preview of the OOXML structures we create.  Keeping this
 * separate from docx's class instances makes the export contract testable
 * without comparing binary ZIP output.
 */
export interface DocxExportPlan {
  blocks: DocxPlanBlock[]
}

export type DocxPlanBlock =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: number }
  | { kind: 'code'; language?: string; text: string }
  | {
    kind: 'table'
    columns: number
    widths: number[]
    rows: number
    /** Word table header plus row pagination semantics, kept testable. */
    pagination: ReturnType<typeof tablePaginationMetadata>
    /** Narrative and styling decisions shared with the binary backend. */
    presentation: { number: number; caption: string; notes: readonly string[]; sources: readonly string[] }
    rowStyle: { zebra: boolean; firstColumnEmphasis: boolean; summaryRowEmphasis: boolean }
  }
  | { kind: 'quote'; blocks: number }
  | { kind: 'rule' }

/** Describes the editable Word structures which will be emitted for an IR. */
export function planDocxExport(ir: DocumentIR, options: Pick<DocxExportOptions, 'tableStudio' | 'tablePreset'> = {}): DocxExportPlan {
  const counter = { tableNumber: 0 }
  return { blocks: ir.blocks.flatMap((block) => planBlock(block, counter, options)) }
}

function planBlock(block: BlockIR, context: { tableNumber: number }, options: Pick<DocxExportOptions, 'tableStudio' | 'tablePreset'>): DocxPlanBlock[] {
  switch (block.kind) {
    case 'heading': return [{ kind: 'heading', level: block.depth, text: inlineText(block.children) }]
    case 'paragraph': return [{ kind: 'paragraph', text: inlineText(block.children) }]
    case 'list': return [{ kind: 'list', ordered: block.ordered, items: block.items.length }]
    case 'code': return [{ kind: 'code', language: block.language, text: block.value }]
    case 'table': {
      const tableIndex = context.tableNumber++
      const layout = planStudioTable(block, options.tableStudio ?? { version: 1, tables: {} }, { availableWidth: 80 }, tableIndex, options.tablePreset)
      const total = layout.columns.reduce((sum, column) => sum + column.assignedWidth, 0) || 1
      return [{
        kind: 'table',
        columns: block.header.cells.length,
        widths: pageWidths(layout.columns.map((column) => column.assignedWidth), total),
        rows: block.rows.length + 1,
        pagination: tablePaginationMetadata(),
        presentation: resolveTablePresentation(block, tableIndex + 1),
        rowStyle: { zebra: true, firstColumnEmphasis: true, summaryRowEmphasis: true },
      }]
    }
    case 'blockquote': return [{ kind: 'quote', blocks: block.blocks.length }]
    case 'thematicBreak': return [{ kind: 'rule' }]
    default: return []
  }
}

/** Builds an OOXML document from the renderer-independent DocumentIR. */
export function documentIrToDocx(ir: DocumentIR, options: DocxExportOptions = {}): Document {
  const style = docxStyle(options.template)
  const presentation = resolveExportPresentation(options.template?.id, options.metadata)
  const bodyChildren = [
    ...ir.blocks.flatMap((block) => toDocxBlocks(block, 0, style, { tableNumber: 0 }, options.printMode ?? 'color', options)),
    ...reviewAppendixBlocks(options.reviewAppendix, style),
  ]
  const coverChildren = presentation.template.frontMatter.showCover && (presentation.metadata.title || presentation.coverFields.length)
    ? docxCover(presentation, style)
    : []
  const landscape = presentation.template.tokens.page.allowLandscapeTables
    && ir.blocks.some((block) => block.kind === 'table' && block.header.cells.length >= 8)
  const bodySection = {
    properties: {
      ...(coverChildren.length ? { type: SectionType.NEXT_PAGE } : {}),
      page: { margin: style.margins, ...(landscape ? { size: { orientation: PageOrientation.LANDSCAPE } } : {}) },
    },
    ...docxHeaderFooter(presentation, style),
    children: bodyChildren,
  }
  return new Document({
    numbering: {
      config: [{
        reference: 'markdown-numbered-list',
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
      }],
    },
    sections: coverChildren.length
      ? [{ properties: { page: { margin: style.margins } }, children: coverChildren }, bodySection]
      : [bodySection],
  })
}

function reviewAppendixBlocks(review: ReviewExportData | undefined, style: DocxStyle): Paragraph[] {
  if (!review) return []
  const annotations = review.annotations ?? []
  const excerpts = review.excerpts ?? []
  const children: Paragraph[] = [
    new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '审阅记录', font: style.headingFont, size: style.bodySize, color: style.headingColor })] }),
    new Paragraph({ children: [new TextRun({ text: `原文：${review.documentTitle}。此附录来自批注 sidecar，不改写 Markdown 原文。`, italics: true, font: style.bodyFont, size: style.bodySize })], spacing: { after: style.paragraphAfter } }),
  ]
  if (excerpts.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '摘录', font: style.headingFont, size: style.bodySize, color: style.headingColor })] }))
    for (const excerpt of excerpts) children.push(new Paragraph({ children: [new TextRun({ text: `${excerpt.content}\n来源：${review.documentTitle}${reviewSource(excerpt.anchor.headingPath)}`, font: style.bodyFont, size: style.bodySize })], indent: { left: 360 }, spacing: { after: style.paragraphAfter } }))
  }
  if (annotations.length) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '批注与修订意见', font: style.headingFont, size: style.bodySize, color: style.headingColor })] }))
    for (const annotation of annotations) children.push(new Paragraph({ children: [new TextRun({ text: `${annotation.kind}：${annotation.anchor.quote}${reviewSource(annotation.anchor.headingPath)}${annotation.note ? `\n意见：${annotation.note}` : ''}`, font: style.bodyFont, size: style.bodySize })], bullet: { level: 0 }, spacing: { after: style.paragraphAfter } }))
  }
  if (!annotations.length && !excerpts.length) children.push(new Paragraph({ children: [new TextRun({ text: '暂无批注或摘录。', font: style.bodyFont, size: style.bodySize })] }))
  return children
}

function reviewSource(headingPath: readonly string[]): string {
  return headingPath.length ? ` · ${headingPath.join(' > ')}` : ''
}

function docxCover(presentation: ReturnType<typeof resolveExportPresentation>, style: DocxStyle): Paragraph[] {
  const title = presentation.metadata.title ?? presentation.coverFields.find((field) => field.key === 'title')?.value ?? ''
  const logo = presentation.template.frontMatter.showLogo ? presentation.metadata.logo : undefined
  return [
    ...(logo?.data && logo.type ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 }, children: [new ImageRun({ data: logo.data, type: logo.type, transformation: { width: 160, height: 56 }, altText: { title: logo.alt, description: logo.alt, name: logo.alt } })] })] : []),
    new Paragraph({ spacing: { before: 2800, after: 320 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: title, bold: true, font: style.headingFont, size: Math.round(style.bodySize * 2) })] }),
    ...(presentation.metadata.subtitle ? [new Paragraph({ spacing: { after: 680 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: presentation.metadata.subtitle, font: style.bodyFont, size: Math.round(style.bodySize * 1.2) })] })] : []),
    ...presentation.coverFields.filter((field) => field.key !== 'title' && field.key !== 'subtitle').map((field) => new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `${field.label}: ${field.value}`, font: style.bodyFont, size: style.bodySize })],
    })),
  ]
}

function docxHeaderFooter(presentation: ReturnType<typeof resolveExportPresentation>, style: DocxStyle): Pick<ConstructorParameters<typeof Document>[0]['sections'][number], 'headers' | 'footers'> {
  const { headerFooter } = presentation.template
  const { metadata } = presentation
  const title = metadata.title ?? ''
  const headerText = headerFooter.header === 'title-version' && metadata.version
    ? [title, metadata.version].filter(Boolean).join(' · ')
    : headerFooter.header === 'none' ? '' : title
  const headers = headerText ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerText, font: style.bodyFont, size: Math.max(16, style.bodySize - 2), color: '64748B' })] })] }) } : undefined
  const footers = headerFooter.footer === 'none' ? undefined : {
    default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      ...(headerFooter.footer === 'page-title' && title ? [new TextRun({ text: `${title} · `, font: style.bodyFont, size: Math.max(16, style.bodySize - 2), color: '64748B' })] : []),
      new TextRun({ children: [PageNumber.CURRENT], font: style.bodyFont, size: Math.max(16, style.bodySize - 2), color: '64748B' }),
    ] })] }),
  }
  return { ...(headers ? { headers } : {}), ...(footers ? { footers } : {}) }
}

/** Generates a browser-compatible DOCX Blob; no server or Tauri bridge is required. */
export async function createDocxBlob(ir: DocumentIR, options: DocxExportOptions = {}): Promise<Blob> {
  const images = options.images ?? await resolveExportImages(ir, options.sourcePath, options.imageResolver)
  return Packer.toBlob(documentIrToDocx(ir, { ...options, images }))
}

/** Saves an editable .docx through the native picker, with a browser-download fallback. */
export async function downloadDocx(ir: DocumentIR, fileName = 'document.docx', options: DocxExportOptions = {}): Promise<ExportSaveResult | null> {
  const blob = await createDocxBlob(ir, options)
  return fileService.saveExportFile(blob, fileName, 'docx')
}

function toDocxBlocks(block: BlockIR, listLevel: number, style: DocxStyle, context: { tableNumber: number }, printMode: 'color' | 'monochrome', options: DocxExportOptions): Array<Paragraph | Table> {
  switch (block.kind) {
    case 'heading':
      return [new Paragraph({ heading: headingLevel(block.depth), children: toRuns(block.children, false, false, false, style, true) })]
    case 'paragraph':
      return [new Paragraph({ children: toRuns(block.children, false, false, false, style), spacing: { after: style.paragraphAfter } })]
    case 'list':
      return block.items.flatMap((item) => item.blocks.flatMap((itemBlock) => {
        if (itemBlock.kind === 'paragraph') {
          return [new Paragraph({
            children: taskPrefix(item.checked).concat(toRuns(itemBlock.children, false, false, false, style)),
            bullet: block.ordered ? undefined : { level: listLevel },
            numbering: block.ordered ? { reference: 'markdown-numbered-list', level: listLevel } : undefined,
          })]
        }
        return toDocxBlocks(itemBlock, listLevel + 1, style, context, printMode, options)
      }))
    case 'blockquote':
      return block.blocks.flatMap((quoted) => quoted.kind === 'paragraph'
        ? [new Paragraph({ children: toRuns(quoted.children, false, false, false, style), indent: { left: 720 }, border: { left: { color: '94A3B8', space: 8, style: 'single', size: 12 } } })]
        : toDocxBlocks(quoted, listLevel, style, context, printMode, options))
    case 'code':
      return [new Paragraph({
        children: [new TextRun({ text: block.value, font: style.codeFont, size: Math.max(14, style.bodySize - 3) })],
        shading: { type: ShadingType.CLEAR, color: 'auto', fill: style.codeBackground },
        spacing: { before: 120, after: 120 },
      })]
    case 'math':
      return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: block.value, italics: true, font: style.bodyFont, size: style.bodySize })] })]
    case 'thematicBreak':
      return [new Paragraph({ border: { bottom: { color: 'CBD5E1', space: 1, style: 'single', size: 6 } } })]
    case 'image': {
      const image = options.images?.[block.url]
      if (!image) return [new Paragraph({ children: [new TextRun({ text: `[Image unavailable: ${block.alt || block.url}]`, italics: true, font: style.bodyFont, size: style.bodySize })] })]
      const size = fitImage(image.width, image.height, 520, 650)
      const type = image.mimeType === 'image/jpeg' ? 'jpg' : image.mimeType.slice('image/'.length) as 'png' | 'gif' | 'bmp'
      const alt = block.alt || block.title || block.url
      return [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: image.bytes, type, transformation: size, altText: { title: alt, description: alt, name: alt } })] })]
    }
    case 'table':
      return toTable(block, style, ++context.tableNumber, printMode, options)
  }
}

function toTable(table: TableIR, style: DocxStyle, number: number, printMode: 'color' | 'monochrome', options: DocxExportOptions): Array<Paragraph | Table> {
  const layout = planStudioTable(table, options.tableStudio ?? { version: 1, tables: {} }, { availableWidth: 80 }, number - 1, options.tablePreset)
  const total = layout.columns.reduce((sum, column) => sum + column.assignedWidth, 0) || 1
  const availableWidth = table.header.cells.length >= 8 && (options.template ?? getExportTemplate()).tokens.page.allowLandscapeTables
    ? LANDSCAPE_TEXT_WIDTH_DXA
    : PAGE_TEXT_WIDTH_DXA
  const widths = pageWidths(layout.columns.map((column) => column.assignedWidth), total, availableWidth)
  const row = (cells: TableIR['header']['cells'], header = false, bodyIndex = 0) => {
    const summary = !header && isSummaryRow(cells) && style.summaryRowEmphasis
    const stripe = !header && bodyIndex % 2 === 1
    return new TableRow({
    tableHeader: header,
    cantSplit: true,
    children: cells.map((cell, index) => new TableCell({
      width: { size: widths[index] ?? 1, type: WidthType.DXA },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 120, right: 120 },
      shading: header || summary || stripe ? { type: ShadingType.CLEAR, color: 'auto', fill: header ? (printMode === 'monochrome' ? 'D9D9D9' : style.tableHeaderBackground) : summary ? (printMode === 'monochrome' ? 'E7E7E7' : 'E2E8F0') : (printMode === 'monochrome' ? 'F5F5F5' : style.tableStripeBackground) } : undefined,
      children: [new Paragraph({ alignment: alignment(layout.columns[index]?.alignment), children: toRuns(cell.children, header || summary || (index === 0 && style.firstColumnEmphasis), false, false, style, header) })],
    })),
    })
  }
  const presentation = resolveTablePresentation(table, number)
  const before = presentation.caption ? [new Paragraph({ children: [new TextRun({ text: `表 ${number}：${presentation.caption}`, bold: true, font: style.headingFont, size: style.bodySize })], spacing: { before: 140, after: 60 } })] : []
  const wordTable = new Table({
    rows: [row(table.header.cells, true), ...table.rows.map((body, index) => row(body.cells, false, index))],
    width: { size: availableWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
  })
  const after = [
    ...presentation.notes.map((text) => new Paragraph({ children: [new TextRun({ text: `注：${text}`, italics: true, font: style.bodyFont, size: Math.max(16, style.bodySize - 2) })], spacing: { before: 40 } })),
    ...presentation.sources.map((text) => new Paragraph({ children: [new TextRun({ text: `来源：${text}`, italics: true, font: style.bodyFont, size: Math.max(16, style.bodySize - 2) })], spacing: { before: 40, after: style.paragraphAfter } })),
  ]
  return [...before, wordTable, ...after]
}

function isSummaryRow(cells: TableIR['header']['cells']): boolean {
  return /^(?:total|subtotal|grand total)\b|^(?:合计|总计|小计)/i.test(inlineText(cells[0]?.children ?? []).trim())
}

function toRuns(children: InlineIR[], forceBold = false, forceItalics = false, forceStrike = false, style: DocxStyle = docxStyle(undefined), heading = false): TextRun[] {
  const common = { font: heading ? style.headingFont : style.bodyFont, size: style.bodySize, color: heading ? style.headingColor : undefined }
  return children.flatMap((child): TextRun[] => {
    switch (child.kind) {
      case 'text': return [new TextRun({ text: child.value, bold: forceBold, italics: forceItalics, strike: forceStrike, ...common })]
      case 'inlineCode': return [new TextRun({ text: child.value, bold: forceBold, italics: forceItalics, strike: forceStrike, ...common, font: style.codeFont, shading: { type: ShadingType.CLEAR, color: 'auto', fill: style.codeBackground } })]
      case 'break': return [new TextRun({ break: 1, ...common })]
      case 'math': return [new TextRun({ text: child.value, bold: forceBold, italics: true, strike: forceStrike, ...common })]
      case 'image': return [new TextRun({ text: `[Image: ${child.alt || child.url}]`, bold: forceBold, italics: true, strike: forceStrike, ...common })]
      case 'emphasis': return toRuns(child.children, forceBold, true, forceStrike, style, heading)
      case 'strong': return toRuns(child.children, true, forceItalics, forceStrike, style, heading)
      case 'delete': return toRuns(child.children, forceBold, forceItalics, true, style, heading)
      case 'link': return [new TextRun({ text: inlineText(child.children), color: '0563C1', underline: { type: 'single' }, bold: forceBold, italics: forceItalics, strike: forceStrike, font: common.font, size: common.size })]
    }
  })
}

function taskPrefix(checked: boolean | null | undefined): TextRun[] {
  return checked === null || checked === undefined ? [] : [new TextRun({ text: checked ? '☒ ' : '☐ ' })]
}

function headingLevel(depth: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  return [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][depth - 1] ?? HeadingLevel.HEADING_6
}

function alignment(value: 'left' | 'center' | 'right' | undefined): (typeof AlignmentType)[keyof typeof AlignmentType] {
  return value === 'right' ? AlignmentType.RIGHT : value === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT
}

/**
 * Word requires integer twips.  Allocate rounding remainder deterministically
 * so fixed-layout tables always occupy exactly the planned text width.
 */
function pageWidths(weights: number[], total: number, availableWidth = PAGE_TEXT_WIDTH_DXA): number[] {
  if (!weights.length) return []
  const widths = weights.map((weight) => Math.max(1, Math.floor(availableWidth * weight / total)))
  let remainder = availableWidth - widths.reduce((sum, width) => sum + width, 0)
  for (let index = 0; remainder > 0; index = (index + 1) % widths.length) {
    widths[index] += 1
    remainder -= 1
  }
  // This branch only protects pathological future callers with more columns
  // than available twips; normal table layouts never need it.
  for (let index = widths.length - 1; remainder < 0 && index >= 0; index -= 1) {
    if (widths[index] > 1) { widths[index] -= 1; remainder += 1 }
  }
  return widths
}
