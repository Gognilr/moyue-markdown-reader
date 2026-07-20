import type { DocumentLensCategory, DocumentLensFilter, DocumentLensItem } from '../../types'

type LensFacet = 'action' | 'command' | 'data'

/**
 * Build source-line-preserving extracts without sending Markdown anywhere.
 * The command/data facets deliberately use lexical Markdown rules so their
 * result is stable for the same source file and can always be opened locally.
 */
export function buildDocumentLens(markdown: string): DocumentLensItem[] {
  const lines = markdown.split(/\r?\n/)
  const headingPath: string[] = []
  const items: DocumentLensItem[] = []
  let codeFence: { marker: string; language: string; start: number; lines: string[] } | null = null
  let table: { start: number; lines: string[] } | null = null

  const flushCode = () => {
    if (!codeFence) return
    const text = codeFence.lines.join('\n').trim()
    if (text) {
      const language = codeFence.language ? `（${codeFence.language}）` : ''
      const reason = isChartFence(codeFence.language, text) ? `图表定义代码块${language}` : `围栏代码块${language}`
      items.push(makeItem(codeFence.start, text, headingPath, ['step'], isChartFence(codeFence.language, text) ? ['command', 'data'] : ['command'], reason))
    }
    codeFence = null
  }
  const flushTable = () => {
    if (!table) return
    const text = table.lines.join('\n').trim()
    if (text) items.push(makeItem(table.start, text, headingPath, ['evidence'], ['data'], 'Markdown 表格'))
    table = null
  }

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const fence = /^\s*(```+|~~~+)\s*([^\s]*)/.exec(line)
    if (fence) {
      flushTable()
      if (codeFence) flushCode()
      else codeFence = { marker: fence[1][0], language: fence[2].toLowerCase(), start: index + 1, lines: [] }
      continue
    }
    if (codeFence) { codeFence.lines.push(line); continue }

    if (isTableLine(line)) {
      if (!table) table = { start: index + 1, lines: [] }
      table.lines.push(line)
      continue
    }
    flushTable()

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) { headingPath.splice(heading[1].length - 1); headingPath[heading[1].length - 1] = heading[2].trim(); continue }
    if (!line.trim() || /^\s*<!--/.test(line)) continue
    const text = stripListMarker(line)
    if (!text) continue
    const categories = categoriesFor(text, headingPath, text !== line.trim())
    const explicit = explicitFacets(line, text)
    const inferred = facetsFor(line, text)
    const facets = [...new Set([...explicit.facets, ...inferred])]
    if (categories.length || facets.length) items.push(makeItem(index + 1, text, headingPath, categories, facets, explain(categories, facets, explicit.reason)))
  }
  flushTable()
  flushCode()
  return items
}

export function filterDocumentLens(items: DocumentLensItem[], filter: DocumentLensFilter, query = ''): DocumentLensItem[] {
  const needle = query.trim().toLowerCase()
  return items.filter((item) => {
    const matchesFilter = filter === 'all' || filter === 'conclusion' ? filter === 'all' || item.categories.includes('conclusion') : filter === 'risk' ? item.categories.includes('risk') : item.facets.includes(filter)
    return matchesFilter && (!needle || `${item.text} ${item.headingPath.join(' ')}`.toLowerCase().includes(needle))
  })
}

export function groupDocumentLens(items: DocumentLensItem[]): Array<{ heading: string; items: DocumentLensItem[] }> {
  const groups = new Map<string, DocumentLensItem[]>()
  for (const item of items) { const heading = item.headingPath.join(' / ') || '文档正文'; groups.set(heading, [...(groups.get(heading) ?? []), item]) }
  return [...groups.entries()].map(([heading, groupItems]) => ({ heading, items: groupItems }))
}

function makeItem(line: number, text: string, headingPath: string[], categories: DocumentLensCategory[], facets: LensFacet[], reason: string): DocumentLensItem {
  return { id: `lens-${line}-${fingerprint(text)}`, line, text, headingPath: [...headingPath].filter(Boolean), categories: [...new Set(categories)], facets: [...new Set(facets)], reason }
}
function categoriesFor(text: string, path: string[], isList: boolean): DocumentLensCategory[] {
  const corpus = `${path.join(' ')} ${text}`.toLowerCase(); const categories: DocumentLensCategory[] = []
  if (/(定义|术语|是什么|means|definition)/i.test(corpus)) categories.push('definition')
  if (/(结论|总结|tldr|tl;dr|最终方案|建议|因此|综上|conclusion|summary)/i.test(corpus)) categories.push('conclusion')
  if (/(证据|数据|指标|来源|引用|显示|证明|according to|evidence)/i.test(corpus)) categories.push('evidence')
  if (/(风险|警告|注意|限制|兼容|失败|禁止|不要|warning|risk|caution|must not)/i.test(corpus)) categories.push('risk')
  if (isList || /(步骤|执行|运行|安装|配置|然后|首先|最后|step\s*\d)/i.test(corpus)) categories.push('step')
  return categories
}
function facetsFor(source: string, text: string): LensFacet[] {
  const facets: LensFacet[] = []
  if (/^\s*[-*+]\s+\[ \]|\b(todo|负责人|owner|截止|due|待确认)\b/i.test(source)) facets.push('action')
  if (hasNumberMetric(text)) facets.push('data')
  if (isShellCommand(text) || /`[^`]+`/.test(text)) facets.push('command')
  return facets
}
function explicitFacets(source: string, text: string): { facets: LensFacet[]; reason: string } {
  if (isShortcut(text)) return { facets: ['command'], reason: '键盘快捷键' }
  if (isConfiguration(text)) return { facets: ['command'], reason: '配置项' }
  if (isChartLine(text)) return { facets: ['data'], reason: '图表引用' }
  if (isCitation(text)) return { facets: ['data'], reason: '引用来源' }
  if (isShellCommand(text)) return { facets: ['command'], reason: 'Shell 命令' }
  if (source.includes('`') && /`[^`]+`/.test(source)) return { facets: ['command'], reason: '内联命令或代码' }
  return { facets: [], reason: '' }
}
function stripListMarker(line: string): string { return line.replace(/^\s*[-*+]\s+(?:\[[ xX]\]\s*)?/, '').replace(/^\s*\d+[.)]\s+/, '').trim() }
function isTableLine(line: string): boolean { return /^\s*\|.*\|\s*$/.test(line) || /^\s*[:|-]+(?:\|\s*[:|-]+)+\|?\s*$/.test(line) }
function isShellCommand(text: string): boolean { return /^(?:\$\s*|#\s+(?:not\s+)?[\w.-]+|(?:npm|pnpm|yarn|bun|cargo|git|docker|kubectl|curl|wget|node|python(?:3)?|pip|powershell|pwsh)\b|(?:cd|ls|dir|mkdir|rm|cp|mv|cat|echo|export|set)\b)/i.test(text) }
function isConfiguration(text: string): boolean { return /^(?:[\w.-]+\s*(?::|=)\s*.+|["'][\w.-]+["']\s*:\s*.+)$/i.test(text) }
function isShortcut(text: string): boolean { return /\b(?:ctrl|cmd|command|alt|option|shift)\s*(?:\+|\+\s*)(?:[a-z0-9]|enter|escape|tab|space|arrow(?:up|down|left|right)|f\d{1,2})\b/i.test(text) }
function hasNumberMetric(text: string): boolean { return /\b\d+(?:[,.]\d+)?\s*(?:%|ms|s|kb|mb|gb|tb|x|人|项|次|行|列|亿元?|万元?|美元|元)\b/i.test(text) }
function isChartLine(text: string): boolean { return /!\[[^\]]*(?:图|图表|chart|graph|plot)[^\]]*\]\([^)]*\)|\b(?:图表|chart|graph|plot)\s*[:：]/i.test(text) }
function isChartFence(language: string, text: string): boolean { return /^(?:mermaid|vega|vega-lite|plantuml)$/i.test(language) || /\b(?:pie|flowchart|graph|xychart|sequenceDiagram)\b/.test(text) }
function isCitation(text: string): boolean { return /(?:\[.+?\]\([^\s)]+\)|\[\^.+?\]|^\s*>.*(?:来源|source|according to))/i.test(text) }
function explain(categories: DocumentLensCategory[], facets: LensFacet[], explicitReason: string): string { return explicitReason || [...categories, ...facets].join('、') || '确定性文本规则' }
function fingerprint(value: string): string { let hash = 0x811c9dc5; for (const char of value.toLowerCase()) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) }; return (hash >>> 0).toString(36) }
