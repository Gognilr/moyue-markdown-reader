/**
 * Portable presentation contract shared by export backends.  It intentionally
 * describes *intent* rather than DOCX/Typst/pdf-lib implementation details:
 * a backend may map fonts, header fields and colours to the best primitives it
 * supports without changing the document's semantic IR.
 */
export type ExportTemplateId =
  | 'technical-report'
  | 'requirements'
  | 'meeting-minutes'
  | 'academic-brief'
  | 'chinese-official'
  | 'readme'

export interface ExportThemeTokens {
  colors: {
    text: string
    mutedText: string
    heading: string
    accent: string
    codeBackground: string
    codeText: string
    tableHeaderBackground: string
    tableBorder: string
  }
  fonts: {
    /** Ordered fallback chain; exporters choose the first verified font. */
    body: string[]
    heading: string[]
    code: string[]
  }
  page: {
    size: 'a4' | 'letter'
    marginsPt: { top: number; right: number; bottom: number; left: number }
    /** Long/wide tables may request a landscape section; it is not a promise. */
    allowLandscapeTables: boolean
  }
  typography: {
    bodySizePt: number
    lineHeight: number
    headingScale: readonly [number, number, number, number, number, number]
    paragraphAfterPt: number
  }
  code: { fontSizePt: number; lineNumbers: boolean }
  table: {
    headerRepeat: boolean
    compact: boolean
    borderWidthPt: number
    /** Alternating body rows improve scanability without changing table data. */
    zebraStripeBackground: string
    /** Emphasize the first column and recognised total row in both backends. */
    firstColumnEmphasis: boolean
    summaryRowEmphasis: boolean
  }
}

export interface ExportTemplate {
  id: ExportTemplateId
  label: string
  description: string
  /** Deterministic hints for an automatic, user-overridable template picker. */
  matchTerms: readonly string[]
  tokens: ExportThemeTokens
  frontMatter: {
    showCover: boolean
    showLogo: boolean
    fields: readonly ('title' | 'subtitle' | 'classification' | 'version' | 'author' | 'date')[]
  }
  headerFooter: {
    header: 'none' | 'title' | 'title-version'
    footer: 'none' | 'page' | 'page-title'
  }
}

export interface ExportDocumentMetadata {
  title?: string
  subtitle?: string
  classification?: string
  version?: string
  author?: string
  date?: string
  /**
   * `source` is the explicitly authored, document-relative image reference.
   * `data` is filled only during an export after that reference has been read;
   * keeping it optional means presentation metadata remains serialisable.
   */
  logo?: { alt: string; source: string; data?: Uint8Array; type?: 'png' | 'jpg' | 'gif' | 'bmp' }
}

export interface ResolvedExportPresentation {
  template: ExportTemplate
  metadata: ExportDocumentMetadata
  /** Fields a cover page can safely render without guessing missing data. */
  coverFields: Array<{ key: string; label: string; value: string }>
}

const baseTokens: ExportThemeTokens = {
  colors: {
    text: '1F2937', mutedText: '64748B', heading: '0F172A', accent: '2563EB',
    codeBackground: 'F1F5F9', codeText: '0F172A', tableHeaderBackground: 'E2E8F0', tableBorder: '94A3B8',
  },
  fonts: {
    body: ['Microsoft YaHei', 'Noto Sans CJK SC', 'Arial'],
    heading: ['Microsoft YaHei UI', 'Noto Sans CJK SC', 'Arial'],
    code: ['Cascadia Code', 'Consolas', 'monospace'],
  },
  page: { size: 'a4', marginsPt: { top: 56.7, right: 56.7, bottom: 56.7, left: 56.7 }, allowLandscapeTables: true },
  typography: { bodySizePt: 10.5, lineHeight: 1.58, headingScale: [2, 1.6, 1.32, 1.15, 1.04, 1] as const, paragraphAfterPt: 7 },
  code: { fontSizePt: 8.8, lineNumbers: false },
  table: {
    headerRepeat: true, compact: false, borderWidthPt: 0.5,
    zebraStripeBackground: 'F8FAFC', firstColumnEmphasis: true, summaryRowEmphasis: true,
  },
}

type ExportThemeOverrides = Omit<Partial<ExportThemeTokens>, 'colors' | 'fonts' | 'page' | 'typography' | 'code' | 'table'> & {
  colors?: Partial<ExportThemeTokens['colors']>
  fonts?: Partial<ExportThemeTokens['fonts']>
  page?: Partial<ExportThemeTokens['page']>
  typography?: Partial<ExportThemeTokens['typography']>
  code?: Partial<ExportThemeTokens['code']>
  table?: Partial<ExportThemeTokens['table']>
}

function tokens(overrides: ExportThemeOverrides): ExportThemeTokens {
  return {
    ...baseTokens,
    ...overrides,
    colors: { ...baseTokens.colors, ...overrides.colors },
    fonts: { ...baseTokens.fonts, ...overrides.fonts },
    page: { ...baseTokens.page, ...overrides.page },
    typography: { ...baseTokens.typography, ...overrides.typography },
    code: { ...baseTokens.code, ...overrides.code },
    table: { ...baseTokens.table, ...overrides.table },
  }
}

const commonFields = ['title', 'subtitle', 'version', 'author', 'date'] as const

/** Built-ins are data, not opaque binary templates, so all backends share them. */
export const exportTemplates: readonly ExportTemplate[] = [
  {
    id: 'technical-report', label: '技术报告', description: '清晰的技术正文、代码和数据表格。',
    matchTerms: ['技术报告', 'architecture', 'api', 'design', '技术方案', '实现'],
    tokens: tokens({ code: { lineNumbers: true }, table: { compact: true }, colors: { accent: '0F766E' } }),
    frontMatter: { showCover: true, showLogo: true, fields: commonFields },
    headerFooter: { header: 'title-version', footer: 'page-title' },
  },
  {
    id: 'requirements', label: '需求文档', description: '突出范围、验收项与版本信息。',
    matchTerms: ['需求', 'requirement', 'prd', '验收', '用户故事'],
    tokens: tokens({ colors: { accent: '7C3AED', tableHeaderBackground: 'EDE9FE' } }),
    frontMatter: { showCover: true, showLogo: true, fields: commonFields },
    headerFooter: { header: 'title-version', footer: 'page' },
  },
  {
    id: 'meeting-minutes', label: '会议纪要', description: '紧凑呈现结论、行动项、负责人和日期。',
    matchTerms: ['会议纪要', '会议', 'minutes', 'action items', '参会'],
    tokens: tokens({ typography: { lineHeight: 1.48, paragraphAfterPt: 5 }, table: { compact: true }, colors: { accent: 'B45309', tableHeaderBackground: 'FEF3C7' } }),
    frontMatter: { showCover: false, showLogo: false, fields: ['title', 'date', 'author', 'version'] },
    headerFooter: { header: 'title', footer: 'page' },
  },
  {
    id: 'academic-brief', label: '学术简稿', description: '克制的学术短文，保留引文和公式的版面空间。',
    matchTerms: ['摘要', 'abstract', '关键词', '参考文献', 'methodology'],
    tokens: tokens({ fonts: { body: ['SimSun', 'Noto Serif CJK SC', 'Times New Roman'], heading: ['SimHei', 'Noto Serif CJK SC', 'Times New Roman'] }, typography: { lineHeight: 1.7, paragraphAfterPt: 8 }, colors: { accent: '334155' } }),
    frontMatter: { showCover: false, showLogo: false, fields: ['title', 'subtitle', 'author', 'date'] },
    headerFooter: { header: 'title', footer: 'page' },
  },
  {
    id: 'chinese-official', label: '中文公文', description: '适合内部正式通知与公文草稿，导出前仍须人工审阅规范。',
    matchTerms: ['通知', '请示', '函', '决定', '通报', '公文'],
    tokens: tokens({ fonts: { body: ['FangSong', 'STFangsong', 'Noto Serif CJK SC'], heading: ['SimHei', 'Microsoft YaHei', 'Noto Sans CJK SC'] }, typography: { bodySizePt: 12, lineHeight: 1.8, paragraphAfterPt: 0 }, colors: { heading: '000000', accent: 'A61B1B' } }),
    frontMatter: { showCover: false, showLogo: false, fields: ['title', 'classification', 'author', 'date'] },
    headerFooter: { header: 'none', footer: 'page' },
  },
  {
    id: 'readme', label: 'README', description: '面向项目说明的紧凑技术文档。',
    matchTerms: ['readme', 'installation', 'quick start', 'getting started', '使用说明'],
    tokens: tokens({ page: { size: 'letter', allowLandscapeTables: true }, typography: { lineHeight: 1.5 }, code: { lineNumbers: true }, table: { compact: true }, colors: { accent: '0969DA', tableHeaderBackground: 'DDF4FF' } }),
    frontMatter: { showCover: false, showLogo: true, fields: ['title', 'subtitle', 'version', 'date'] },
    headerFooter: { header: 'title', footer: 'page-title' },
  },
]

export const defaultExportTemplateId: ExportTemplateId = 'technical-report'

export function getExportTemplate(id: ExportTemplateId = defaultExportTemplateId): ExportTemplate {
  return exportTemplates.find((template) => template.id === id) ?? exportTemplates[0]
}

/** Local deterministic recommendation; callers must keep the final choice user-overridable. */
export function suggestExportTemplate(markdown: string, fileName = ''): ExportTemplateId {
  const text = `${fileName}\n${markdown.slice(0, 12_000)}`.toLocaleLowerCase()
  let best = getExportTemplate()
  let bestScore = 0
  for (const template of exportTemplates) {
    const score = template.matchTerms.reduce((total, term) => total + (text.includes(term.toLocaleLowerCase()) ? 1 : 0), 0)
    if (score > bestScore) { best = template; bestScore = score }
  }
  return best.id
}

export function resolveExportPresentation(id: ExportTemplateId | undefined, metadata: ExportDocumentMetadata = {}): ResolvedExportPresentation {
  const template = getExportTemplate(id)
  const labels: Record<string, string> = { title: '标题', subtitle: '副标题', classification: '密级', version: '版本', author: '作者', date: '日期' }
  const coverFields = template.frontMatter.fields.flatMap((key) => {
    const value = metadata[key]
    return value ? [{ key, label: labels[key], value }] : []
  })
  return { template, metadata, coverFields }
}
