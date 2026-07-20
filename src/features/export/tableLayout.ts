import { inlineText, type TableIR } from './documentIr'

export type TableColumnKind = 'text' | 'number' | 'percentage' | 'currency' | 'date' | 'code' | 'status'
export type TableWidthStrategy = 'auto' | 'equal' | 'content' | 'fixedRatio'

export interface TableColumnPlan {
  index: number
  header: string
  kind: TableColumnKind
  alignment: 'left' | 'center' | 'right'
  minWidth: number
  idealWidth: number
  assignedWidth: number
}

export interface TableLayoutPlan {
  strategy: TableWidthStrategy
  availableWidth: number
  columns: TableColumnPlan[]
  requiresLandscape: boolean
}

export interface TableLayoutOptions {
  availableWidth?: number
  strategy?: TableWidthStrategy
  fixedRatios?: number[]
}

const DEFAULT_WIDTH = 80
const MIN_WIDTH = 8
const STATUS_WORDS = new Set(['todo', 'done', 'doing', 'blocked', 'open', 'closed', 'pending', 'active', 'draft', '完成', '进行中', '阻塞', '待办'])

export function planTableLayout(table: TableIR, options: TableLayoutOptions = {}): TableLayoutPlan {
  const availableWidth = options.availableWidth ?? DEFAULT_WIDTH
  const strategy = options.strategy ?? 'auto'
  const columnCount = table.header.cells.length
  const columns = Array.from({ length: columnCount }, (_, index): TableColumnPlan => {
    const values = [table.header, ...table.rows].map((row) => inlineText(row.cells[index]?.children ?? []))
    const header = values[0] ?? ''
    const kind = inferColumnKind(header, values.slice(1))
    const longest = Math.max(...values.map(displayWidth), MIN_WIDTH)
    const minWidth = Math.min(Math.max(kind === 'text' ? 12 : 8, Math.ceil(longest * 0.35)), 24)
    const idealWidth = Math.min(Math.max(longest + 2, minWidth), kind === 'text' ? 36 : 24)
    return { index, header, kind, alignment: alignmentFor(kind, table.align[index]), minWidth, idealWidth, assignedWidth: 0 }
  })

  const requested = requestedWidths(columns, strategy, options.fixedRatios, availableWidth)
  const assigned = fitWidths(requested, columns.map((column) => column.minWidth), availableWidth)
  columns.forEach((column, index) => { column.assignedWidth = assigned[index] ?? 0 })
  return { strategy, availableWidth, columns, requiresLandscape: columns.reduce((sum, column) => sum + column.minWidth, 0) > availableWidth }
}

export function inferColumnKind(header: string, values: string[]): TableColumnKind {
  const nonEmpty = values.map((value) => value.trim()).filter(Boolean)
  const sample = nonEmpty.length ? nonEmpty : [header.trim()]
  const all = (pattern: RegExp) => sample.every((value) => pattern.test(value))
  const lowerHeader = header.toLowerCase()
  if (all(/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*%$/)) return 'percentage'
  if (all(/^(?:[$€£¥]|USD\s?|CNY\s?)[+-]?[\d,]+(?:\.\d+)?$/i)) return 'currency'
  if (all(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) return 'date'
  if (all(/^[+-]?[\d,]+(?:\.\d+)?$/)) return 'number'
  if (sample.every((value) => STATUS_WORDS.has(value.toLowerCase()))) return 'status'
  if (/(^|\b)(id|code|sku|uuid)(\b|$)|编号|代码/.test(lowerHeader) || sample.every((value) => /^[A-Za-z][\w-]{3,}$/.test(value))) return 'code'
  return 'text'
}

function alignmentFor(kind: TableColumnKind, source: TableIR['align'][number]): 'left' | 'center' | 'right' {
  if (source) return source
  if (kind === 'number' || kind === 'percentage' || kind === 'currency') return 'right'
  return kind === 'status' ? 'center' : 'left'
}

function requestedWidths(columns: TableColumnPlan[], strategy: TableWidthStrategy, ratios: number[] | undefined, available: number): number[] {
  if (strategy === 'equal') return columns.map(() => available / Math.max(columns.length, 1))
  if (strategy === 'fixedRatio' && ratios?.length === columns.length && ratios.every((ratio) => ratio > 0)) {
    const total = ratios.reduce((sum, ratio) => sum + ratio, 0)
    return ratios.map((ratio) => available * ratio / total)
  }
  return columns.map((column) => strategy === 'content' ? column.idealWidth : column.idealWidth + (column.kind === 'text' ? 4 : 0))
}

function fitWidths(requested: number[], minimums: number[], available: number): number[] {
  const desiredTotal = requested.reduce((sum, width) => sum + width, 0)
  if (desiredTotal <= available) {
    const extra = available - desiredTotal
    return requested.map((width) => width + extra * width / Math.max(desiredTotal, 1))
  }
  const minimumTotal = minimums.reduce((sum, width) => sum + width, 0)
  if (minimumTotal >= available) return minimums.map((width) => width * available / Math.max(minimumTotal, 1))
  const flexible = requested.map((width, index) => Math.max(width - minimums[index], 0))
  const remaining = available - minimumTotal
  const flexibleTotal = flexible.reduce((sum, width) => sum + width, 0)
  return minimums.map((minimum, index) => minimum + remaining * flexible[index] / Math.max(flexibleTotal, 1))
}

function displayWidth(value: string): number {
  return [...value].reduce((width, character) => width + (character.charCodeAt(0) > 255 ? 2 : 1), 0)
}
