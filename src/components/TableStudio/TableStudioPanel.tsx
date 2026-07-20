import { useEffect, useMemo, useState } from 'react'
import { inlineText, type TableIR } from '../../features/export/documentIr'
import { markdownToDocumentIR } from '../../features/export/markdownToIr'
import { describeTable, emptyTableStudioSidecar, planStudioTable, reassociateTableSettings, settingsForTable, withColumnWidth, withTableSettings, type TableStudioSidecar, type WideTableStrategy } from '../../features/export/tableStudio'
import { parseTableStudioSidecar, serializeTableStudioSidecar, tableStudioSidecarFileName } from '../../features/export/tableStudioSidecar'
import {
  TABLE_PRESET_STORAGE_KEY,
  createTableLayoutPreset,
  parseTableLayoutPresetCatalog,
  removeTableLayoutPreset,
  resolveTableLayoutPreset,
  serializeTableLayoutPresetCatalog,
  setAutomaticTableLayoutPreset,
  type TableLayoutPresetCatalog,
} from '../../features/export/tableStudioPresets'
import type { TableWidthStrategy } from '../../features/export/tableLayout'
import { suggestReadingPersonality } from '../../features/reading-personality/readingPersonality'
import { fileService, isTauri } from '../../services/fileService'

export interface TableStudioPanelProps {
  markdown: string
  documentKey: string
  documentPath: string | null
  onNotice: (message: string) => void
}

const STORAGE_PREFIX = 'markdown-reader:table-studio:'
const widthStrategies: Array<{ value: TableWidthStrategy; label: string }> = [
  { value: 'auto', label: '自动' }, { value: 'equal', label: '均分' }, { value: 'content', label: '按内容' }, { value: 'fixedRatio', label: '固定比例' },
]
const wideStrategies: Array<{ value: WideTableStrategy; label: string }> = [
  { value: 'landscape', label: '横向页面' }, { value: 'narrowMargins', label: '窄页边距' }, { value: 'smallerFont', label: '缩小字号' }, { value: 'splitLinked', label: '关联拆表' },
]

/**
 * A deliberately conservative export-preference editor. It operates on an
 * adjacent JSON sidecar (or browser local storage) and never changes Markdown.
 */
export function TableStudioPanel({ markdown, documentKey, documentPath, onNotice }: TableStudioPanelProps) {
  const tables = useMemo(() => markdownToDocumentIR(markdown).blocks.filter((block): block is TableIR => block.kind === 'table'), [markdown])
  const [sidecar, setSidecar] = useState<TableStudioSidecar>(emptyTableStudioSidecar)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [presetCatalog, setPresetCatalog] = useState<TableLayoutPresetCatalog>(() => parseTableLayoutPresetCatalog(globalThis.localStorage?.getItem(TABLE_PRESET_STORAGE_KEY)))
  const [presetName, setPresetName] = useState('')
  const documentKind = useMemo(() => suggestReadingPersonality(markdown).kind, [markdown])

  useEffect(() => {
    setSelectedIndex(0)
    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        let raw: string | null = null
        if (documentPath && isTauri()) {
          const directory = await fileService.getDirname(documentPath)
          const sidecarPath = await fileService.joinPath(directory, tableStudioSidecarFileName(documentPath))
          if (await fileService.exists(sidecarPath)) raw = await fileService.readTextFile(sidecarPath)
        } else {
          raw = window.localStorage.getItem(`${STORAGE_PREFIX}${documentKey}`)
        }
        if (!cancelled) setSidecar(reassociateTableSettings(raw ? parseTableStudioSidecar(raw) : emptyTableStudioSidecar(), tables))
      } catch (error) {
        console.warn('Unable to load Table Studio sidecar:', error)
        if (!cancelled) {
          setSidecar(emptyTableStudioSidecar())
          onNotice('表格工作台设置无法读取，已安全使用新的本地设置。')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [documentKey, documentPath, tables, onNotice])

  const persist = (next: TableStudioSidecar) => {
    setSidecar(next)
    void (async () => {
      try {
        if (documentPath && isTauri()) {
          const directory = await fileService.getDirname(documentPath)
          await fileService.writeTextFile(await fileService.joinPath(directory, tableStudioSidecarFileName(documentPath)), serializeTableStudioSidecar(next))
        } else {
          window.localStorage.setItem(`${STORAGE_PREFIX}${documentKey}`, serializeTableStudioSidecar(next))
        }
        onNotice('表格导出偏好已保存到独立 sidecar；Markdown 原文未修改。')
      } catch (error) {
        console.warn('Unable to save Table Studio sidecar:', error)
        onNotice('表格导出偏好保存失败；Markdown 原文未修改。')
      }
    })()
  }

  const persistPresetCatalog = (next: TableLayoutPresetCatalog) => {
    setPresetCatalog(next)
    try {
      globalThis.localStorage?.setItem(TABLE_PRESET_STORAGE_KEY, serializeTableLayoutPresetCatalog(next))
    } catch (error) {
      console.warn('Unable to save Table Studio preset catalog:', error)
      onNotice('表格预设库保存失败；当前会话内的选择仍会保留。')
    }
  }

  const selectDocumentPreset = (presetId?: string) => {
    const { presetId: _previous, ...rest } = sidecar
    persist(presetId ? { ...rest, presetId } : rest)
  }

  if (tables.length === 0) return <p className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm text-[var(--text-muted)]">当前文档没有 GFM 表格可供导出排版。</p>
  const index = Math.min(selectedIndex, tables.length - 1)
  const table = tables[index]
  const descriptor = describeTable(table, index)
  const selectedPreset = resolveTableLayoutPreset(presetCatalog, documentKind, sidecar.presetId)
  const tableSettings = settingsForTable(sidecar, descriptor)
  const layout = planStudioTable(table, sidecar, { availableWidth: 80 }, index, selectedPreset?.settings)
  const settings = layout.settings
  const selectedWide = settings?.wideTableStrategy ?? layout.wideTable.recommended

  return <section className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3" aria-label="Smart Table Studio 导出排版工作台">
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <label className="text-sm">表格
        <select value={index} onChange={(event) => setSelectedIndex(Number(event.target.value))} className="ml-1 rounded border border-[var(--border)] bg-transparent px-2 py-1">
          {tables.map((item, tableIndex) => <option value={tableIndex} key={describeTable(item, tableIndex).fingerprint}>表格 {tableIndex + 1}：{item.header.cells.map((cell) => inlineText(cell.children)).filter(Boolean).slice(0, 3).join(' / ') || '未命名列'}</option>)}
        </select>
      </label>
      <span className="text-xs text-[var(--text-muted)]">{isLoading ? '读取本地导出偏好…' : `共 ${tables.length} 张；仅保存导出侧设置`}</span>
    </div>

    <fieldset className="mb-3 rounded-lg border border-[var(--border)] p-2">
      <legend className="px-1 text-sm">表格排版预设</legend>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--text-muted)]">文档类型：{kindLabels[documentKind]}</span>
        <label>本文件
          <select value={sidecar.presetId ?? ''} onChange={(event) => selectDocumentPreset(event.target.value || undefined)} className="ml-1 rounded border border-[var(--border)] bg-transparent px-2 py-1">
            <option value="">自动（按 {kindLabels[documentKind]} 类型）</option>
            {Object.values(presetCatalog.presets).map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
        </label>
        <span className="text-xs text-[var(--text-muted)]">{selectedPreset ? `当前应用：${selectedPreset.name}${sidecar.presetId ? '（本文件固定）' : '（自动）'}` : '当前未匹配预设'}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={presetName} onChange={(event) => setPresetName(event.target.value)} placeholder="将当前表格设置存为预设" className="min-w-48 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm" aria-label="新表格预设名称" />
        <button type="button" disabled={!presetName.trim()} onClick={() => {
          const next = createTableLayoutPreset(presetCatalog, { name: presetName, settings: {
            ...(settings?.widthOverrides ? { widthOverrides: settings.widthOverrides } : {}),
            ...(settings?.widthStrategy ? { widthStrategy: settings.widthStrategy } : {}),
            ...(settings?.wideTableStrategy ? { wideTableStrategy: settings.wideTableStrategy } : {}),
          } })
          const created = Object.values(next.presets).find((preset) => !presetCatalog.presets[preset.id])
          persistPresetCatalog(next)
          if (created) selectDocumentPreset(created.id)
          setPresetName('')
          onNotice('表格排版预设已保存；Markdown 原文未修改。')
        }} className="rounded border border-[var(--border)] px-2 py-1 text-sm disabled:opacity-50">保存为预设</button>
        {selectedPreset && <>
          <button type="button" onClick={() => { persistPresetCatalog(setAutomaticTableLayoutPreset(presetCatalog, documentKind, selectedPreset.id)); onNotice(`已将“${selectedPreset.name}”设为 ${kindLabels[documentKind]} 的自动表格预设。`) }} className="rounded border border-[var(--border)] px-2 py-1 text-sm">设为该类型自动预设</button>
          <button type="button" onClick={() => { persistPresetCatalog(removeTableLayoutPreset(presetCatalog, selectedPreset.id)); selectDocumentPreset(undefined); onNotice('表格排版预设已删除；本文件已切回自动选择。') }} className="rounded border border-[var(--border)] px-2 py-1 text-sm">删除当前预设</button>
        </>}
      </div>
      {tableSettings && selectedPreset && <p className="mt-2 text-xs text-[var(--text-muted)]">本表已有单独设置，会优先于预设；可安全保留例外列宽。</p>}
    </fieldset>

    <div className="mb-3 grid gap-2 sm:grid-cols-2">
      <label className="text-sm">列宽策略
        <select value={settings?.widthStrategy ?? 'auto'} onChange={(event) => persist(withTableSettings(sidecar, descriptor, { widthStrategy: event.target.value as TableWidthStrategy }))} className="ml-1 rounded border border-[var(--border)] bg-transparent px-2 py-1">
          {widthStrategies.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <span className="text-xs text-[var(--text-muted)]">最小宽度 {layout.columns.reduce((sum, column) => sum + column.minWidth, 0).toFixed(0)} / 可用宽度 {layout.availableWidth}</span>
    </div>

    <div className="mb-3 overflow-x-auto rounded-lg border border-[var(--border)]">
      <table className="min-w-full text-left text-xs" aria-label="列宽预览">
        <thead><tr className="border-b border-[var(--border)]"><th className="p-2">列</th><th className="p-2">类型</th><th className="p-2">自动宽度</th><th className="p-2">手动宽度</th></tr></thead>
        <tbody>{layout.columns.map((column) => <tr key={column.index} className="border-b border-[var(--border)] last:border-0"><td className="p-2">{column.header || `第 ${column.index + 1} 列`}</td><td className="p-2">{column.kind}</td><td className="p-2">{column.assignedWidth.toFixed(1)}</td><td className="p-2"><ColumnWidthControl value={settings?.widthOverrides?.[column.index]} fallback={Math.round(column.assignedWidth)} minimum={Math.ceil(column.minWidth)} onApply={(width) => persist(withColumnWidth(sidecar, descriptor, column.index, width, layout.columns.length))} /></td></tr>)}</tbody>
      </table>
    </div>

    <fieldset className="rounded-lg bg-[var(--hover)] p-2">
      <legend className="px-1 text-sm">宽表输出预览</legend>
      <div className="flex flex-wrap gap-2">{layout.wideTable.previews.map((preview) => <label key={preview.strategy} className="rounded border border-[var(--border)] px-2 py-1 text-xs"><input type="radio" name={`wide-table-${descriptor.fingerprint}`} checked={selectedWide === preview.strategy} onChange={() => persist(withTableSettings(sidecar, descriptor, { wideTableStrategy: preview.strategy }))} /> {wideStrategies.find((item) => item.value === preview.strategy)?.label} · {preview.fits ? '可容纳' : `仍溢出 ${preview.overflow.toFixed(0)}`}</label>)}</div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">建议：{wideStrategies.find((item) => item.value === layout.wideTable.recommended)?.label}。该选择会交给后续 DOCX/PDF 导出后端；当前阅读视图及 Markdown 文件均不变。</p>
    </fieldset>
  </section>
}

const kindLabels = {
  readme: 'README / 指南',
  technical: '技术文档',
  minutes: '会议纪要',
  longform: '长文',
  report: '报告',
} as const

function ColumnWidthControl({ value, fallback, minimum, onApply }: { value: number | undefined; fallback: number; minimum: number; onApply: (width: number) => void }) {
  const [draft, setDraft] = useState(String(value ?? fallback))
  useEffect(() => setDraft(String(value ?? fallback)), [value, fallback])
  const apply = () => {
    const width = Number(draft)
    if (!Number.isFinite(width) || width < minimum) return
    onApply(width)
  }
  return <span className="inline-flex items-center gap-1"><input type="number" min={minimum} value={draft} onChange={(event) => setDraft(event.target.value)} className="w-16 rounded border border-[var(--border)] bg-transparent px-1 py-0.5" aria-label="手动列宽" /><button type="button" onClick={apply} className="rounded border border-[var(--border)] px-1 py-0.5">应用</button></span>
}
