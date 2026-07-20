import { describe, expect, it } from 'vitest'
import { formatTableNumber, inferTableUnit, isFocusedTableCell, isLongTableCell, matchesTableQuery, selectedTableGrid, sortTableRows, summarizeNumericColumn, toCsv, toMarkdown, toTsv, transposeTableGrid } from './tableLens'

describe('Table Lens helpers', () => {
  it('matches a query across every cell', () => {
    expect(matchesTableQuery(['Release', 'Ready'], 'ready')).toBe(true)
    expect(matchesTableQuery(['Release', 'Ready'], 'blocked')).toBe(false)
  })

  it('keeps the active row and column readable without mutating the grid', () => {
    const focus = { row: 2, column: 1 }
    expect(isFocusedTableCell(focus, 2, 4)).toBe(true)
    expect(isFocusedTableCell(focus, 0, 1)).toBe(true)
    expect(isFocusedTableCell(focus, 0, 0)).toBe(false)
    expect(isFocusedTableCell(null, 0, 0)).toBe(true)
  })

  it('summarizes numeric values and tracks empty values', () => {
    expect(summarizeNumericColumn(['1,200', '2.5', '', '3'])).toEqual({ count: 3, empty: 1, sum: 1205.5, average: 1205.5 / 3, min: 2.5, max: 1200 })
    expect(summarizeNumericColumn(['10', 'unknown'])).toBeNull()
  })

  it('exports a grid as TSV and Markdown', () => {
    const grid = [['Name', 'Note'], ['A', 'one|two']]
    expect(toTsv(grid)).toBe('Name\tNote\nA\tone|two')
    expect(toMarkdown(grid)).toBe('| Name | Note |\n| --- | --- |\n| A | one\\|two |')
    expect(toCsv([['Name', 'Note'], ['A', 'said "hi"']])).toBe('"Name","Note"\r\n"A","said ""hi"""')
  })

  it('infers explicit shared units and derives a focused copy grid', () => {
    const grid = [['收入（万元）', '成本（万元）'], ['12', '8']]
    expect(inferTableUnit(grid[0])).toBe('万元')
    expect(inferTableUnit(['收入（万元）', '数量（件）'])).toBe('')
    expect(selectedTableGrid(grid, { row: 1, column: 1 }, 'column')).toEqual([['成本（万元）'], ['8']])
  })

  it('sorts a derived reader grid without changing the input', () => {
    const grid = [['Name', 'Score'], ['Beta', '12'], ['Alpha', '2'], ['Gamma', '12']]
    expect(sortTableRows(grid, 1, 'ascending')).toEqual([['Name', 'Score'], ['Alpha', '2'], ['Beta', '12'], ['Gamma', '12']])
    expect(sortTableRows(grid, 0, 'descending')).toEqual([['Name', 'Score'], ['Gamma', '12'], ['Beta', '12'], ['Alpha', '2']])
    expect(grid[1]).toEqual(['Beta', '12'])
  })

  it('transposes ragged grids for a reader-only wide-table view', () => {
    expect(transposeTableGrid([['Metric', 'Q1', 'Q2'], ['Revenue', '12']])).toEqual([
      ['Metric', 'Revenue'], ['Q1', '12'], ['Q2', ''],
    ])
  })

  it('formats numeric cells and leaves non-numeric text intact', () => {
    expect(formatTableNumber('1,200', 'number', 'kg')).toMatch(/1[,.]?200 kg/)
    expect(formatTableNumber('0.125', 'percent')).toContain('12.5')
    expect(formatTableNumber('unknown', 'compact')).toBe('unknown')
    expect(formatTableNumber('1,200', 'source')).toBe('1,200')
    expect(isLongTableCell('x'.repeat(121))).toBe(true)
    expect(isLongTableCell('short')).toBe(false)
  })
})
