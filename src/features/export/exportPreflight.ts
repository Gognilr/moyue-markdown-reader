import { inlineText, type BlockIR, type DocumentIR, type InlineIR } from './documentIr'
import { planTableLayout, type TableLayoutOptions } from './tableLayout'
import type { ResourceInventory, ResourceMetadata } from '../health/documentHealth'

export type ExportConfidence = 'A' | 'B' | 'C'
export type ExportPreflightIssueKind = 'missingResource' | 'unreadableImage' | 'remoteResource' | 'wideTable' | 'unsupportedHtml'
export type ExportPreflightSeverity = 'blocking' | 'warning' | 'info'
/** Export-only handling state shown before an export starts. */
export type ExportPreflightDisposition = 'autoFixed' | 'needsChoice' | 'cannotGuarantee'

export interface ExportPreflightIssue {
  id: string
  kind: ExportPreflightIssueKind
  severity: ExportPreflightSeverity
  confidence: ExportConfidence
  location: string
  message: string
  suggestedFix: string
  resource?: string
  /** Never represents a source Markdown mutation. */
  disposition: ExportPreflightDisposition
}

export interface ExportPreflightOptions {
  /** Original Markdown is optional, but lets the preflight report HTML that cannot enter DocumentIR. */
  sourceMarkdown?: string
  tableLayout?: TableLayoutOptions
  /** A synchronous, backend-neutral resource inventory for local attachments. */
  hasLocalResource?: (url: string) => boolean
  /** Metadata collected by the native, document-scoped resource inventory. */
  resourceInventory?: ResourceInventory
}

export interface ExportPreflightReport {
  issues: ExportPreflightIssue[]
  /** A/B/C is deterministic export evidence, never visual-fidelity proof. */
  confidence: ExportConfidence
  canExport: boolean
  summary: Record<ExportConfidence, number>
  evidence: readonly string[]
  downgradeReasons: readonly string[]
}

export interface ExportConfidenceAssessment {
  grade: ExportConfidence
  label: string
  evidence: readonly string[]
  downgradeReasons: readonly string[]
}

/**
 * Conservative grade from deterministic preflight evidence. This does not
 * verify Word, a PDF renderer, font substitution, or pixel-level layout.
 */
export function assessExportConfidence(issues: readonly ExportPreflightIssue[]): ExportConfidenceAssessment {
  const evidence = [
    '已运行 DocumentIR 语义结构与导出预检规则。',
    '未执行 Word、PDF 阅读器、字体替换或像素级视觉验证。',
  ]
  const downgradeReasons = issues.map((entry) => `${entry.location}：${entry.message}`)
  if (issues.some((entry) => entry.severity === 'blocking')) {
    return { grade: 'C', label: 'C：存在未解决的确定性阻塞项，不能导出', evidence, downgradeReasons }
  }
  if (issues.length) {
    return { grade: 'B', label: 'B：可导出但存在已记录的降级或兼容性风险', evidence, downgradeReasons }
  }
  return { grade: 'A', label: 'A：结构性预检通过（非视觉验证）', evidence, downgradeReasons }
}

/**
 * Performs deterministic, renderer-free checks before a DOCX/PDF backend is invoked.
 * It never loads URLs or touches the DOM/filesystem; a host can supply its attachment
 * inventory through `hasLocalResource` when it has one.
 */
export function preflightExport(document: DocumentIR, options: ExportPreflightOptions = {}): ExportPreflightReport {
  const issues: ExportPreflightIssue[] = []
  let blockIndex = 0
  const inspectInline = (children: InlineIR[], location: string) => children.forEach((child) => {
    if (child.kind === 'image') inspectResource(child.url, location, 'image')
    else if (child.kind === 'link') {
      inspectResource(child.url, location, 'link')
      inspectInline(child.children, location)
    } else if ('children' in child) inspectInline(child.children, location)
  })
  const inspectBlock = (block: BlockIR, location: string): void => {
    switch (block.kind) {
      case 'image': inspectResource(block.url, location, 'image'); break
      case 'heading': case 'paragraph': inspectInline(block.children, location); break
      case 'blockquote': block.blocks.forEach((nested, index) => inspectBlock(nested, `${location} > quote ${index + 1}`)); break
      case 'list': block.items.forEach((item, itemIndex) => item.blocks.forEach((nested, nestedIndex) => inspectBlock(nested, `${location} > item ${itemIndex + 1}.${nestedIndex + 1}`))); break
      case 'table': {
        const plan = planTableLayout(block, options.tableLayout)
        if (plan.requiresLandscape) issues.push(issue('wideTable', 'warning', 'B', location, `表格最小宽度超过可用页宽（${plan.columns.reduce((total, column) => total + column.minWidth, 0)} > ${plan.availableWidth}）。`, '切换横向页面、拆分表格，或缩短列内容。'))
        block.header.cells.forEach((cell, index) => inspectInline(cell.children, `${location} > header ${index + 1}`))
        block.rows.forEach((row, rowIndex) => row.cells.forEach((cell, cellIndex) => inspectInline(cell.children, `${location} > row ${rowIndex + 1}, column ${cellIndex + 1}`)))
        break
      }
      default: break
    }
  }
  const inspectResource = (url: string, location: string, label: 'image' | 'link'): void => {
    const value = url.trim()
    if (!value || /^javascript:/i.test(value)) {
      issues.push(issue('missingResource', 'blocking', 'C', location, `${label === 'image' ? '图片' : '链接'}资源为空或不安全，无法导出。`, '替换为有效的本地文件路径或 HTTPS 地址。', url))
    } else if (/^https?:\/\//i.test(value)) {
      issues.push(issue('remoteResource', 'warning', 'B', location, `远程${label === 'image' ? '图片' : '链接'}可能在离线导出时不可用。`, '下载并改为随文档打包的本地资源，或在导出前确认网络可用。', value))
    } else if (!isDataUrl(value) && isKnownMissing(value, options)) {
      issues.push(issue('missingResource', 'blocking', 'C', location, `未在附件清单中找到本地${label === 'image' ? '图片' : '链接'}资源。`, '修正路径，或将资源加入导出附件清单。', value))
    } else if (label === 'image' && isKnownEmptyLocalImage(value, options)) {
      issues.push(issue('unreadableImage', 'blocking', 'C', location,
        'The verified local image is empty (0 bytes), so it cannot be included in the export.',
        'Restore or replace the image before exporting.', value))
    }
  }

  document.blocks.forEach((block) => { blockIndex += 1; inspectBlock(block, `block ${blockIndex}${block.kind === 'heading' ? `: ${inlineText(block.children)}` : ''}`) })
  if (options.sourceMarkdown) inspectUnsupportedHtml(options.sourceMarkdown, issues)

  const summary: Record<ExportConfidence, number> = { A: 0, B: 0, C: 0 }
  issues.forEach((entry) => { summary[entry.confidence] += 1 })
  const assessment = assessExportConfidence(issues)
  return { issues, confidence: assessment.grade, canExport: !issues.some((entry) => entry.severity === 'blocking'), summary, evidence: assessment.evidence, downgradeReasons: assessment.downgradeReasons }
}

function inspectUnsupportedHtml(markdown: string, issues: ExportPreflightIssue[]): void {
  const htmlTag = /<\/?[A-Za-z][^>]*>/g
  let match: RegExpExecArray | null
  while ((match = htmlTag.exec(markdown))) {
    const line = markdown.slice(0, match.index).split('\n').length
    issues.push(issue('unsupportedHtml', 'warning', 'B', `source line ${line}`, `HTML 标签 ${match[0]} 不在跨后端 DocumentIR 导出契约内。`, '改用等价的 Markdown 语法，或由导出后端显式支持该 HTML 标签。', match[0]))
  }
}

function issue(kind: ExportPreflightIssueKind, severity: ExportPreflightSeverity, confidence: ExportConfidence, location: string, message: string, suggestedFix: string, resource?: string): ExportPreflightIssue {
  const disposition: ExportPreflightDisposition = kind === 'missingResource' || kind === 'unreadableImage'
      ? 'cannotGuarantee'
      : kind === 'unsupportedHtml'
        ? 'cannotGuarantee'
        : 'needsChoice'
  return { id: `${kind}:${location}:${resource ?? message}`, kind, severity, confidence, location, message, suggestedFix, resource, disposition }
}

function isDataUrl(url: string): boolean { return /^data:/i.test(url) }

function resourceMetadata(inventory: ResourceInventory | undefined, url: string): ResourceMetadata | undefined {
  return typeof inventory === 'function' ? inventory(url) : inventory?.[url]
}

function isKnownMissing(url: string, options: ExportPreflightOptions): boolean {
  const metadata = resourceMetadata(options.resourceInventory, url)
  return metadata?.exists === false || (!metadata && Boolean(options.hasLocalResource) && !options.hasLocalResource!(url))
}

function isKnownEmptyLocalImage(url: string, options: ExportPreflightOptions): boolean {
  const metadata = resourceMetadata(options.resourceInventory, url)
  return metadata?.exists === true && metadata.byteLength === 0
}
