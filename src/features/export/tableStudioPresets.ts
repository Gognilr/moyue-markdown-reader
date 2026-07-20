import type { ReadingPersonalitySuggestion } from '../../types'
import type { TableLayoutPresetSettings } from './tableStudio'

export type TableDocumentKind = ReadingPersonalitySuggestion['kind']

export interface TableLayoutPreset {
  id: string
  name: string
  settings: TableLayoutPresetSettings
  createdAt: number
  updatedAt: number
}

/** User-level preset library. Document sidecars only hold an optional preset id. */
export interface TableLayoutPresetCatalog {
  version: 1
  presets: Record<string, TableLayoutPreset>
  automaticByKind: Partial<Record<TableDocumentKind, string>>
}

export const TABLE_PRESET_STORAGE_KEY = 'markdown-reader:table-layout-presets.v1'

export function emptyTableLayoutPresetCatalog(): TableLayoutPresetCatalog {
  return { version: 1, presets: {}, automaticByKind: {} }
}

export function createTableLayoutPreset(
  catalog: TableLayoutPresetCatalog,
  input: { id?: string; name: string; settings: TableLayoutPresetSettings },
  now = Date.now(),
): TableLayoutPresetCatalog {
  const name = input.name.trim()
  if (!name) throw new Error('Preset name is required')
  const id = input.id ?? makePresetId(name, now, catalog.presets)
  if (!validPresetId(id)) throw new Error('Invalid preset id')
  const existing = catalog.presets[id]
  const preset: TableLayoutPreset = {
    id,
    name,
    settings: sanitizeSettings(input.settings),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  return { ...catalog, presets: { ...catalog.presets, [id]: preset } }
}

export function removeTableLayoutPreset(catalog: TableLayoutPresetCatalog, id: string): TableLayoutPresetCatalog {
  if (!catalog.presets[id]) return catalog
  const { [id]: _removed, ...presets } = catalog.presets
  const automaticByKind = Object.fromEntries(Object.entries(catalog.automaticByKind).filter(([, presetId]) => presetId !== id)) as TableLayoutPresetCatalog['automaticByKind']
  return { version: 1, presets, automaticByKind }
}

export function setAutomaticTableLayoutPreset(
  catalog: TableLayoutPresetCatalog,
  kind: TableDocumentKind,
  presetId: string | null,
): TableLayoutPresetCatalog {
  const automaticByKind = { ...catalog.automaticByKind }
  if (presetId === null) delete automaticByKind[kind]
  else if (catalog.presets[presetId]) automaticByKind[kind] = presetId
  return { ...catalog, automaticByKind }
}

/** Explicit document choice wins; otherwise resolve the user-selected type rule. */
export function resolveTableLayoutPreset(
  catalog: TableLayoutPresetCatalog,
  documentKind: TableDocumentKind,
  explicitPresetId?: string,
): TableLayoutPreset | undefined {
  const id = explicitPresetId ?? catalog.automaticByKind[documentKind]
  return id ? catalog.presets[id] : undefined
}

export function serializeTableLayoutPresetCatalog(catalog: TableLayoutPresetCatalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`
}

export function parseTableLayoutPresetCatalog(raw: string | null | undefined): TableLayoutPresetCatalog {
  if (!raw) return emptyTableLayoutPresetCatalog()
  try {
    const parsed = JSON.parse(raw) as Partial<TableLayoutPresetCatalog>
    if (parsed.version !== 1 || !parsed.presets || typeof parsed.presets !== 'object' || Array.isArray(parsed.presets)) return emptyTableLayoutPresetCatalog()
    const presets: Record<string, TableLayoutPreset> = {}
    for (const [id, value] of Object.entries(parsed.presets)) {
      const entry = value as Partial<TableLayoutPreset>
      if (!validPresetId(id) || entry.id !== id || typeof entry.name !== 'string' || !entry.name.trim() || !Number.isFinite(entry.createdAt) || !Number.isFinite(entry.updatedAt)) continue
      presets[id] = { id, name: entry.name.trim(), settings: sanitizeSettings(entry.settings ?? {}), createdAt: entry.createdAt!, updatedAt: entry.updatedAt! }
    }
    const automaticByKind: TableLayoutPresetCatalog['automaticByKind'] = {}
    if (parsed.automaticByKind && typeof parsed.automaticByKind === 'object') {
      for (const kind of documentKinds) {
        const presetId = parsed.automaticByKind[kind]
        if (typeof presetId === 'string' && presets[presetId]) automaticByKind[kind] = presetId
      }
    }
    return { version: 1, presets, automaticByKind }
  } catch {
    return emptyTableLayoutPresetCatalog()
  }
}

const documentKinds: readonly TableDocumentKind[] = ['readme', 'technical', 'minutes', 'longform', 'report']

function sanitizeSettings(settings: TableLayoutPresetSettings): TableLayoutPresetSettings {
  const widthOverrides = settings.widthOverrides?.map((width) => typeof width === 'number' && Number.isFinite(width) && width > 0 ? width : undefined)
  return {
    ...(widthOverrides?.some((width) => width !== undefined) ? { widthOverrides } : {}),
    ...(settings.widthStrategy ? { widthStrategy: settings.widthStrategy } : {}),
    ...(settings.wideTableStrategy ? { wideTableStrategy: settings.wideTableStrategy } : {}),
  }
}

function validPresetId(id: string): boolean {
  return /^table-preset-[a-z0-9-]{3,80}$/i.test(id)
}

function makePresetId(name: string, now: number, existing: Record<string, TableLayoutPreset>): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'layout'
  let id = `table-preset-${slug}-${now.toString(36)}`
  let attempt = 2
  while (existing[id]) id = `table-preset-${slug}-${now.toString(36)}-${attempt++}`
  return id
}
