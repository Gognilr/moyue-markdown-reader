import { emptyTableStudioSidecar, type TableStudioSettings, type TableStudioSidecar, type WideTableStrategy } from './tableStudio'
import type { TableWidthStrategy } from './tableLayout'

const WIDTH_STRATEGIES: readonly TableWidthStrategy[] = ['auto', 'equal', 'content', 'fixedRatio']
const WIDE_STRATEGIES: readonly WideTableStrategy[] = ['landscape', 'narrowMargins', 'smallerFont', 'splitLinked']

/** Adjacent, human-readable preferences for export only; never a Markdown rewrite. */
export function tableStudioSidecarFileName(documentPath: string): string {
  const base = documentPath.split(/[\\/]/).pop() || 'document.md'
  return `${base}.mdreader.tables.json`
}

export function serializeTableStudioSidecar(sidecar: TableStudioSidecar): string {
  return `${JSON.stringify({ version: 1, tables: sidecar.tables, ...(sidecar.presetId ? { presetId: sidecar.presetId } : {}) }, null, 2)}\n`
}

/** Reject malformed entries rather than applying an export preference to a wrong table. */
export function parseTableStudioSidecar(raw: string): TableStudioSidecar {
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; tables?: unknown; presetId?: unknown }
    if (parsed.version !== 1 || !parsed.tables || typeof parsed.tables !== 'object' || Array.isArray(parsed.tables)) return emptyTableStudioSidecar()
    const tables: Record<string, TableStudioSettings> = {}
    for (const [key, value] of Object.entries(parsed.tables as Record<string, unknown>)) {
      const entry = value as Partial<TableStudioSettings>
      if (!validFingerprint(key) || entry.fingerprint !== key || !validFingerprint(entry.structureFingerprint) || !validFingerprint(entry.contentFingerprint)) continue
      const widthOverrides = Array.isArray(entry.widthOverrides)
        ? entry.widthOverrides.map((width) => width === undefined || width === null ? undefined : (Number.isFinite(width) && width > 0 ? width : undefined))
        : undefined
      tables[key] = {
        fingerprint: key,
        structureFingerprint: entry.structureFingerprint,
        contentFingerprint: entry.contentFingerprint,
        ...(widthOverrides?.some((width) => width !== undefined) ? { widthOverrides } : {}),
        ...(WIDTH_STRATEGIES.includes(entry.widthStrategy as TableWidthStrategy) ? { widthStrategy: entry.widthStrategy as TableWidthStrategy } : {}),
        ...(WIDE_STRATEGIES.includes(entry.wideTableStrategy as WideTableStrategy) ? { wideTableStrategy: entry.wideTableStrategy as WideTableStrategy } : {}),
      }
    }
    return { version: 1, tables, ...(validPresetId(parsed.presetId) ? { presetId: parsed.presetId } : {}) }
  } catch {
    return emptyTableStudioSidecar()
  }
}

function validPresetId(value: unknown): value is string {
  return typeof value === 'string' && /^table-preset-[a-z0-9-]{3,80}$/i.test(value)
}

function validFingerprint(value: unknown): value is string {
  return typeof value === 'string' && /^table-[0-9a-f]{8}$/i.test(value)
}
