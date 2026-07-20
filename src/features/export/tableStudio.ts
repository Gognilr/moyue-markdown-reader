import { inlineText, type TableIR } from './documentIr'
import { planTableLayout, type TableLayoutPlan, type TableLayoutOptions, type TableWidthStrategy } from './tableLayout'

/**
 * The sidecar contract for Smart Table Studio.  It deliberately stores only
 * export preferences: table source Markdown is never rewritten by resizing a
 * column in the studio.
 */
export interface TableStudioSidecar {
  version: 1
  tables: Record<string, TableStudioSettings>
  /** Optional per-document explicit choice; absent means use the type rule. */
  presetId?: string
}

export interface TableLayoutPresetSettings {
  /** Undefined slots retain the planner's automatic width for that column. */
  widthOverrides?: Array<number | undefined>
  widthStrategy?: TableWidthStrategy
  wideTableStrategy?: WideTableStrategy
}

export interface TableStudioSettings extends TableLayoutPresetSettings {
  fingerprint: string
  structureFingerprint: string
  /** Normalized cell content used to reconnect a setting after an edit. */
  contentFingerprint: string
}

export interface TableDescriptor {
  fingerprint: string
  structureFingerprint: string
  contentFingerprint: string
  index: number
}

export type WideTableStrategy = 'landscape' | 'narrowMargins' | 'smallerFont' | 'splitLinked'

export interface WideTablePreview {
  strategy: WideTableStrategy
  availableWidth: number
  scale: number
  fits: boolean
  overflow: number
  summary: string
}

export interface WideTableDecision {
  requiredWidth: number
  baseAvailableWidth: number
  recommended: WideTableStrategy
  previews: WideTablePreview[]
}

export interface StudioTableLayout extends TableLayoutPlan {
  fingerprint: string
  /** Effective settings after optional type/document preset plus table overrides. */
  settings?: TableLayoutPresetSettings
  manualWidthsApplied: boolean
  wideTable: WideTableDecision
}

const minimumFor = (plan: TableLayoutPlan) => plan.columns.map((column) => column.minWidth)

export function describeTable(table: TableIR, index = 0): TableDescriptor {
  const columns = table.header.cells.length
  const header = table.header.cells.map((cell) => normalize(inlineText(cell.children))).join('|')
  const align = table.align.map((value) => value ?? '').join('|')
  const allCells = [table.header, ...table.rows]
    .map((row) => row.cells.map((cell) => normalize(inlineText(cell.children))).join('|'))
    .join('\n')
  const structureFingerprint = hash(`v1|${columns}|${align}|${header}`)
  const contentFingerprint = hash(`v1|${columns}|${allCells}`)
  return { fingerprint: hash(`${structureFingerprint}|${contentFingerprint}|${index}`), structureFingerprint, contentFingerprint, index }
}

export const emptyTableStudioSidecar = (): TableStudioSidecar => ({ version: 1, tables: {} })

/** Locate an exact setting first, then reconnect a setting after a content edit.
 * Reconnection only happens when the table structure is unique; ambiguity is
 * deliberately left unresolved rather than applying a width to the wrong table.
 */
export function settingsForTable(sidecar: TableStudioSidecar, descriptor: TableDescriptor): TableStudioSettings | undefined {
  const exact = sidecar.tables[descriptor.fingerprint]
  if (exact) return exact
  const candidates = Object.values(sidecar.tables).filter((entry) => entry.structureFingerprint === descriptor.structureFingerprint)
  return candidates.length === 1 ? candidates[0] : undefined
}

/** Re-keys unique structure-compatible preferences to the current table fingerprints. */
export function reassociateTableSettings(sidecar: TableStudioSidecar, tables: TableIR[]): TableStudioSidecar {
  const descriptors = tables.map(describeTable)
  const next: Record<string, TableStudioSettings> = {}
  for (const descriptor of descriptors) {
    const setting = settingsForTable(sidecar, descriptor)
    if (!setting) continue
    next[descriptor.fingerprint] = {
      ...setting,
      fingerprint: descriptor.fingerprint,
      structureFingerprint: descriptor.structureFingerprint,
      contentFingerprint: descriptor.contentFingerprint,
    }
  }
  return { version: 1, tables: next }
}

export function withColumnWidth(
  sidecar: TableStudioSidecar,
  descriptor: TableDescriptor,
  column: number,
  width: number,
  columnCount: number,
): TableStudioSidecar {
  if (!Number.isInteger(column) || column < 0 || column >= columnCount) throw new RangeError('Column index is outside this table')
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('Column width must be positive')
  const existing = settingsForTable(sidecar, descriptor)
  const widthOverrides = Array.from({ length: columnCount }, (_, index) => existing?.widthOverrides?.[index])
  widthOverrides[column] = width
  return {
    version: 1,
    tables: {
      ...sidecar.tables,
      [descriptor.fingerprint]: {
        fingerprint: descriptor.fingerprint,
        structureFingerprint: descriptor.structureFingerprint,
        contentFingerprint: descriptor.contentFingerprint,
        ...existing,
        widthOverrides,
      },
    },
  }
}

/** Updates only the export-side preference for one table. Markdown is never touched. */
export function withTableSettings(
  sidecar: TableStudioSidecar,
  descriptor: TableDescriptor,
  update: Pick<TableStudioSettings, 'widthStrategy' | 'wideTableStrategy'>,
): TableStudioSidecar {
  const existing = settingsForTable(sidecar, descriptor)
  return {
    version: 1,
    tables: {
      ...sidecar.tables,
      [descriptor.fingerprint]: {
        fingerprint: descriptor.fingerprint,
        structureFingerprint: descriptor.structureFingerprint,
        contentFingerprint: descriptor.contentFingerprint,
        ...existing,
        ...update,
      },
    },
  }
}

/**
 * Per-table settings always win over a selected document/type preset.  This
 * gives a preset a safe default role while retaining deliberate exceptions.
 */
export function planStudioTable(
  table: TableIR,
  sidecar: TableStudioSidecar,
  options: TableLayoutOptions = {},
  index = 0,
  preset?: TableLayoutPresetSettings,
): StudioTableLayout {
  const descriptor = describeTable(table, index)
  const tableSettings = settingsForTable(sidecar, descriptor)
  const settings = preset || tableSettings ? { ...preset, ...tableSettings } : undefined
  const plan = planTableLayout(table, { ...options, strategy: settings?.widthStrategy ?? options.strategy })
  const widths = settings?.widthOverrides
  let manualWidthsApplied = false
  if (widths?.length === plan.columns.length) {
    const min = minimumFor(plan)
    const requested = widths.map((width, position) => Math.max(width ?? 0, min[position]))
    const total = requested.reduce((sum, width) => sum + width, 0)
    plan.columns.forEach((column, position) => { column.assignedWidth = requested[position] * plan.availableWidth / total })
    manualWidthsApplied = true
  }
  const requiredWidth = minimumFor(plan).reduce((sum, width) => sum + width, 0)
  return {
    ...plan,
    fingerprint: descriptor.fingerprint,
    settings,
    manualWidthsApplied,
    wideTable: chooseWideTableStrategy(requiredWidth, plan.availableWidth),
  }
}

/**
 * Preview only.  The exporter can later map the selected option to its native
 * DOCX/PDF backend without changing the decision or stored user preference.
 */
export function chooseWideTableStrategy(requiredWidth: number, baseAvailableWidth: number): WideTableDecision {
  const safeRequired = Math.max(requiredWidth, 0)
  const base = Math.max(baseAvailableWidth, 1)
  const alternatives: Array<[WideTableStrategy, number, number, string]> = [
    ['landscape', base * 1.32, 1, '横向页面：保留字号并扩大可用行宽'],
    ['narrowMargins', base * 1.15, 1, '窄页边距：保持正文方向，适合轻度溢出'],
    ['smallerFont', base, 0.88, '缩小表格字号：不改变页边距'],
    ['splitLinked', base, 1, '关联拆表：按列分组并重复关键识别列'],
  ]
  const previews = alternatives.map(([strategy, width, scale, summary]) => {
    const effective = width / scale
    const overflow = Math.max(safeRequired - effective, 0)
    return { strategy, availableWidth: width, scale, fits: overflow === 0 || strategy === 'splitLinked', overflow, summary }
  })
  const firstFit = previews.find((preview) => preview.fits)
  return { requiredWidth: safeRequired, baseAvailableWidth: base, recommended: firstFit?.strategy ?? 'splitLinked', previews }
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

/** Small deterministic hash suitable for a local settings key, not security. */
function hash(value: string): string {
  let result = 0x811c9dc5
  for (const character of value) {
    result ^= character.codePointAt(0) ?? 0
    result = Math.imul(result, 0x01000193)
  }
  return `table-${(result >>> 0).toString(16).padStart(8, '0')}`
}
