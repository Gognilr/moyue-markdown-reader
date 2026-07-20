export type TableGrid = string[][]
export type NumericSummary = { count: number; empty: number; sum: number; average: number; min: number; max: number }
export type TableSortDirection = 'ascending' | 'descending'
export type TableNumberFormat = 'source' | 'number' | 'percent' | 'compact'

const numericPattern = /^[-+]?\d[\d,]*(?:\.\d+)?%?$/

export function readTableGrid(table: HTMLTableElement): TableGrid {
  return Array.from(table.rows, (row) => Array.from(row.cells, (cell) => cell.textContent?.replace(/\s+/g, ' ').trim() ?? ''))
}

export function matchesTableQuery(row: string[], query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  return !needle || row.some((value) => value.toLocaleLowerCase().includes(needle))
}

/**
 * A lens focus never changes the table data: it only decides which cells retain
 * full contrast while the user inspects one row and column intersection.
 */
export function isFocusedTableCell(
  focused: { row: number; column: number } | null,
  row: number,
  column: number,
): boolean {
  return !focused || row === focused.row || column === focused.column
}

export function parseTableNumber(value: string): number | null {
  const text = value.trim()
  if (!numericPattern.test(text)) return null
  const parsed = Number.parseFloat(text.replace(/[,%]/g, ''))
  return Number.isFinite(parsed) ? (text.endsWith('%') ? parsed / 100 : parsed) : null
}

/** Sorts only an in-memory reader grid. The Markdown source and DOM source table
 * are deliberately never changed. Numeric columns use numeric ordering; all
 * other columns use locale-aware text ordering with a stable tie-breaker. */
export function sortTableRows(grid: TableGrid, column: number, direction: TableSortDirection): TableGrid {
  if (grid.length < 3 || column < 0) return grid.map((row) => [...row])
  const multiplier = direction === 'ascending' ? 1 : -1
  const rows = grid.slice(1).map((row, index) => ({ row: [...row], index, value: row[column] ?? '' }))
  return [[...grid[0]], ...rows.sort((left, right) => {
    const leftNumber = parseTableNumber(left.value)
    const rightNumber = parseTableNumber(right.value)
    const comparison = leftNumber !== null && rightNumber !== null
      ? leftNumber - rightNumber
      : left.value.localeCompare(right.value, undefined, { numeric: true, sensitivity: 'base' })
    return comparison === 0 ? left.index - right.index : comparison * multiplier
  }).map(({ row }) => row)]
}

/** Turns a wide reader grid into a tall reader grid, padding ragged rows only
 * in the derived view. */
export function transposeTableGrid(grid: TableGrid): TableGrid {
  const width = Math.max(0, ...grid.map((row) => row.length))
  return Array.from({ length: width }, (_, column) => grid.map((row) => row[column] ?? ''))
}

export function formatTableNumber(value: string, format: TableNumberFormat, unit = ''): string {
  if (format === 'source') return value
  const number = parseTableNumber(value)
  if (number === null) return value
  const formatted = format === 'percent'
    ? new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 2 }).format(number)
    : format === 'compact'
      ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(number)
      : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(number)
  return `${formatted}${unit.trim() ? ` ${unit.trim()}` : ''}`
}

export function isLongTableCell(value: string, threshold = 120): boolean {
  return value.trim().length > threshold
}

export function summarizeNumericColumn(values: string[]): NumericSummary | null {
  const empty = values.filter((value) => !value.trim()).length
  const parsed = values.filter((value) => value.trim()).map(parseTableNumber)
  if (!parsed.length || parsed.some((value) => value === null)) return null
  const numbers = parsed as number[]
  const sum = numbers.reduce((total, value) => total + value, 0)
  return { count: numbers.length, empty, sum, average: sum / numbers.length, min: Math.min(...numbers), max: Math.max(...numbers) }
}

export function toTsv(grid: TableGrid): string {
  return grid.map((row) => row.map((cell) => cell.replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
}

/** RFC 4180-compatible CSV for direct Excel pasting or import. */
export function toCsv(grid: TableGrid): string {
  return grid.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`).join(',')).join('\r\n')
}

/** Infers a unit only from an explicit, shared header suffix. */
export function inferTableUnit(headers: readonly string[]): string {
  const units = headers.map((header) => header.match(/[（(]([^()（）]{1,12})[)）]\s*$/)?.[1]?.trim() ?? '').filter(Boolean)
  return units.length && units.every((unit) => unit === units[0]) ? units[0] : ''
}

export function selectedTableGrid(grid: TableGrid, focused: { row: number; column: number } | null, scope: 'cell' | 'row' | 'column'): TableGrid {
  if (!focused || !grid.length) return []
  if (scope === 'cell') return [[grid[focused.row]?.[focused.column] ?? '']]
  if (scope === 'row') return [grid[0] ?? [], grid[focused.row] ?? []]
  return [[grid[0]?.[focused.column] ?? ''], ...grid.slice(1).map((row) => [row[focused.column] ?? ''])]
}

export function toMarkdown(grid: TableGrid): string {
  if (!grid.length) return ''
  const width = Math.max(...grid.map((row) => row.length))
  const rows = grid.map((row) => Array.from({ length: width }, (_, index) => (row[index] ?? '').replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')))
  const divider = Array.from({ length: width }, () => '---')
  return [rows[0], divider, ...rows.slice(1)].map((row) => `| ${row.join(' | ')} |`).join('\n')
}
