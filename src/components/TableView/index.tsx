import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type TableHTMLAttributes } from 'react'
import { formatTableNumber, inferTableUnit, isFocusedTableCell, isLongTableCell, matchesTableQuery, parseTableNumber, readTableGrid, selectedTableGrid, sortTableRows, summarizeNumericColumn, toCsv, toMarkdown, toTsv, transposeTableGrid, type NumericSummary, type TableNumberFormat, type TableSortDirection } from '../../features/table/tableLens'

type TableViewProps = TableHTMLAttributes<HTMLTableElement> & { children?: ReactNode }

/**
 * The source table remains the React Markdown output. Sorting, transposition
 * and number presentation are derived grids rendered only in this reader.
 * None of these controls writes through to the Markdown document.
 */
export function TableView({ children, ...props }: TableViewProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [query, setQuery] = useState('')
  const [grid, setGrid] = useState<string[][]>([])
  const [focused, setFocused] = useState<{ row: number; column: number } | null>(null)
  const [sortColumn, setSortColumn] = useState<number | null>(null)
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('ascending')
  const [transposed, setTransposed] = useState(false)
  const [numberFormat, setNumberFormat] = useState<TableNumberFormat>('source')
  const [unit, setUnit] = useState('')
  const [expandLongCells, setExpandLongCells] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [notice, setNotice] = useState('')
  const [isToolbarOpen, setIsToolbarOpen] = useState(false)
  const toolbarId = useId()

  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    const syncGrid = () => setGrid(readTableGrid(table))
    syncGrid()
    const observer = new MutationObserver(syncGrid)
    observer.observe(table, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [children])

  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    Array.from(table.rows).forEach((row, index) => {
      row.dataset.tableLensMatch = String(index === 0 || matchesTableQuery(Array.from(row.cells, (cell) => cell.textContent ?? ''), query))
      Array.from(row.cells).forEach((cell) => { cell.dataset.tableLensExpanded = String(expandLongCells || !isLongTableCell(cell.textContent ?? '')) })
    })
  }, [query, grid, expandLongCells])

  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    Array.from(table.rows).forEach((row, rowIndex) => Array.from(row.cells).forEach((cell, columnIndex) => {
      cell.dataset.tableLensFocus = String(isFocusedTableCell(focused, rowIndex, columnIndex))
      cell.dataset.tableLensNumeric = String(rowIndex > 0 && parseTableNumber(cell.textContent ?? '') !== null)
    }))
  }, [focused, grid])
  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('th, td'))
    const listeners = cells.map((cell) => {
      cell.tabIndex = 0
      const onKeyDown = (event: globalThis.KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const row = cell.parentElement as HTMLTableRowElement | null
        if (row) selectCell(row.rowIndex, cell.cellIndex)
      }
      cell.addEventListener('keydown', onKeyDown)
      return () => cell.removeEventListener('keydown', onKeyDown)
    })
    return () => listeners.forEach((remove) => remove())
  }, [grid])
  useEffect(() => {
    const sync = () => setIsFullscreen(document.fullscreenElement === sectionRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const visibleGrid = useMemo(() => grid.filter((row, index) => index === 0 || matchesTableQuery(row, query)), [grid, query])
  const orderedGrid = useMemo(() => sortColumn === null ? visibleGrid : sortTableRows(visibleGrid, sortColumn, sortDirection), [visibleGrid, sortColumn, sortDirection])
  const displayGrid = useMemo(() => {
    const transformed = transposed ? transposeTableGrid(orderedGrid) : orderedGrid
    return transformed.map((row, rowIndex) => row.map((cell) => rowIndex === 0 ? cell : formatTableNumber(cell, numberFormat, unit)))
  }, [orderedGrid, transposed, numberFormat, unit])
  const altered = sortColumn !== null || transposed || numberFormat !== 'source'
  const suggestedUnit = useMemo(() => inferTableUnit(grid[0] ?? []), [grid])
  const summaries = useMemo(() => grid[0]?.map((header, column) => ({ header, summary: summarizeNumericColumn(visibleGrid.slice(1).map((row) => row[column] ?? '')) })).filter((item): item is { header: string; summary: NumericSummary } => Boolean(item.summary)) ?? [], [grid, visibleGrid])
  const copy = async (format: 'tsv' | 'markdown' | 'csv', scope?: 'cell' | 'row' | 'column') => {
    const source = scope ? selectedTableGrid(displayGrid, focused, scope) : displayGrid
    const content = format === 'tsv' ? toTsv(source) : format === 'csv' ? toCsv(source) : toMarkdown(source)
    if (!content || !navigator.clipboard) { setNotice('当前浏览器无法复制表格内容'); return }
    await navigator.clipboard.writeText(content)
    setNotice(`已复制${scope === 'cell' ? '单元格' : scope === 'row' ? '行' : scope === 'column' ? '列' : '当前表格'}为 ${format.toUpperCase()}`)
  }
  const exportXlsx = async () => {
    try {
      const { downloadXlsx } = await import('../../features/table/xlsxExport')
      const result = await downloadXlsx(displayGrid, 'markdown-table.xlsx')
      if (result) setNotice(result.kind === 'native' ? `XLSX 已保存到 ${result.path}` : `XLSX 已下载：${result.fileName}`)
    } catch (error) {
      console.error('Unable to export XLSX:', error)
      setNotice('XLSX 导出失败，请检查表格内容和保存权限。')
    }
  }
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen(); else await sectionRef.current?.requestFullscreen()
    setNotice(document.fullscreenElement ? '已退出表格全屏阅读' : '已进入表格全屏阅读')
  }
  const resetView = () => {
    setSortColumn(null); setTransposed(false); setNumberFormat('source'); setUnit(''); setFocused(null)
    setNotice('表格阅读视图已还原，Markdown 源文件未改变')
  }
  const selectCell = (row: number, column: number) => {
    setFocused({ row, column })
    setNotice(`已选择第 ${row + 1} 行第 ${column + 1} 列，可复制单元格、行或列`)
  }
  const onCellKeyDown = (event: KeyboardEvent<HTMLTableCellElement>, row: number, column: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectCell(row, column)
  }

  return <section ref={sectionRef} className={`table-lens${isFullscreen ? ' table-lens--fullscreen' : ''}`} aria-label="Table Lens">
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{notice || `${Math.max(visibleGrid.length - 1, 0)} 行表格结果`}</p>
    <div className="table-lens__toolbar-toggle">
      <button
        type="button"
        className="table-lens__toolbar-toggle-button"
        data-expanded={isToolbarOpen}
        aria-expanded={isToolbarOpen}
        aria-controls={toolbarId}
        onClick={() => setIsToolbarOpen((open) => !open)}
      >
        {isToolbarOpen ? '收起表格工具' : '表格工具'}
      </button>
      <span className="table-lens__toolbar-summary">表格 · {Math.max(visibleGrid.length - 1, 0)} 行 × {Math.max((grid[0]?.length ?? 0), 0)} 列</span>
    </div>
    {isToolbarOpen && <div id={toolbarId} className="table-lens__toolbar">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="筛选表格" aria-label="筛选表格" />
      <span className="table-lens__count">{Math.max(visibleGrid.length - 1, 0)}/{Math.max(grid.length - 1, 0)} 行</span>
      {grid[0] && <label className="table-lens__select">排序列
        <select aria-label="排序列" value={sortColumn ?? ''} onChange={(event) => setSortColumn(event.target.value === '' ? null : Number(event.target.value))}>
          <option value="">不排序</option>{grid[0].map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `第 ${index + 1} 列`}</option>)}
        </select>
      </label>}
      {sortColumn !== null && <button type="button" onClick={() => setSortDirection((value) => value === 'ascending' ? 'descending' : 'ascending')}>{sortDirection === 'ascending' ? '升序' : '降序'}</button>}
      <button type="button" aria-pressed={transposed} onClick={() => setTransposed((value) => !value)}>转置</button>
      <button type="button" aria-pressed={isFullscreen} onClick={() => void toggleFullscreen()}>{isFullscreen ? '退出全屏' : '全屏阅读'}</button>
      <label className="table-lens__select">数字
        <select aria-label="数字格式" value={numberFormat} onChange={(event) => setNumberFormat(event.target.value as TableNumberFormat)}>
          <option value="source">原始显示</option><option value="number">千分位</option><option value="percent">百分比</option><option value="compact">紧凑单位</option>
        </select>
      </label>
      {numberFormat !== 'source' && <input className="table-lens__unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={suggestedUnit ? `单位（建议：${suggestedUnit}）` : '单位（可选）'} aria-label="数字单位（可选）" />}
      {numberFormat !== 'source' && suggestedUnit && !unit && <button type="button" onClick={() => setUnit(suggestedUnit)}>使用建议单位</button>}
      <button type="button" aria-pressed={expandLongCells} onClick={() => setExpandLongCells((value) => !value)}>{expandLongCells ? '收起长文本' : '展开长文本'}</button>
      <button type="button" onClick={() => void copy('tsv')}>复制 TSV</button>
      <button type="button" onClick={() => void copy('markdown')}>复制 Markdown</button>
      <button type="button" onClick={() => void copy('csv')}>复制 CSV（Excel）</button>
      <button type="button" onClick={() => void exportXlsx()}>导出 XLSX</button>
      {focused && <><button type="button" onClick={() => void copy('tsv', 'cell')}>复制单元格</button><button type="button" onClick={() => void copy('tsv', 'row')}>复制行</button><button type="button" onClick={() => void copy('tsv', 'column')}>复制列</button></>}
      {(focused || altered) && <button type="button" onClick={resetView}>还原视图</button>}
    </div>}
    <div className="table-view" tabIndex={0} aria-label="可横向滚动的表格">
      {altered && <table className="table-lens__derived" aria-label="仅阅读视图，未改写 Markdown 源文件"><thead><tr>{displayGrid[0]?.map((cell, column) => <th key={`${column}-${cell}`} data-table-lens-focus={isFocusedTableCell(focused, 0, column)}>{cell}</th>)}</tr></thead><tbody>{displayGrid.slice(1).map((row, rowIndex) => <tr key={`${rowIndex}-${row.join('\u0001')}`}>{row.map((cell, column) => <td key={`${column}-${cell}`} tabIndex={0} data-table-lens-focus={isFocusedTableCell(focused, rowIndex + 1, column)} data-table-lens-expanded={String(expandLongCells || !isLongTableCell(cell))} onClick={() => selectCell(rowIndex + 1, column)} onKeyDown={(event) => onCellKeyDown(event, rowIndex + 1, column)}>{cell}</td>)}</tr>)}</tbody></table>}
      <table ref={tableRef} {...props} hidden={altered} onClick={(event) => {
        props.onClick?.(event)
        const cell = (event.target as HTMLElement).closest('th, td') as HTMLTableCellElement | null
        if (cell?.parentElement) selectCell((cell.parentElement as HTMLTableRowElement).rowIndex, cell.cellIndex)
      }}>{children}</table>
    </div>
    {summaries.length > 0 && <div className="table-lens__stats" aria-label="数值列统计">
      {summaries.map(({ header, summary }) => <div key={header || String(summary.sum)}><strong>{header || '未命名列'}</strong><span>合计 {summary.sum.toLocaleString()}</span><span>平均 {summary.average.toLocaleString()}</span><span>最小 {summary.min.toLocaleString()}</span><span>最大 {summary.max.toLocaleString()}</span><span>空值 {summary.empty}</span></div>)}
    </div>}
  </section>
}
