import { describe, expect, it } from 'vitest'
import {
  createTableLayoutPreset,
  emptyTableLayoutPresetCatalog,
  parseTableLayoutPresetCatalog,
  removeTableLayoutPreset,
  resolveTableLayoutPreset,
  serializeTableLayoutPresetCatalog,
  setAutomaticTableLayoutPreset,
} from './tableStudioPresets'

describe('Table Studio layout presets', () => {
  it('uses a type preset automatically but allows an explicit document choice to win', () => {
    let catalog = createTableLayoutPreset(emptyTableLayoutPresetCatalog(), {
      id: 'table-preset-technical', name: '技术宽表', settings: { widthStrategy: 'content', wideTableStrategy: 'landscape' },
    }, 1)
    catalog = createTableLayoutPreset(catalog, {
      id: 'table-preset-document', name: '项目特例', settings: { widthStrategy: 'equal' },
    }, 2)
    catalog = setAutomaticTableLayoutPreset(catalog, 'technical', 'table-preset-technical')

    expect(resolveTableLayoutPreset(catalog, 'technical')?.name).toBe('技术宽表')
    expect(resolveTableLayoutPreset(catalog, 'technical', 'table-preset-document')?.name).toBe('项目特例')
  })

  it('round-trips only safe local preferences and removes dangling automatic mappings', () => {
    let catalog = createTableLayoutPreset(emptyTableLayoutPresetCatalog(), {
      id: 'table-preset-report', name: '报告表格', settings: { widthOverrides: [undefined, 36], widthStrategy: 'fixedRatio' },
    }, 3)
    catalog = setAutomaticTableLayoutPreset(catalog, 'report', 'table-preset-report')
    const restored = parseTableLayoutPresetCatalog(serializeTableLayoutPresetCatalog(catalog))
    expect(restored).toEqual(catalog)

    const removed = removeTableLayoutPreset(restored, 'table-preset-report')
    expect(removed.automaticByKind.report).toBeUndefined()
    expect(resolveTableLayoutPreset(removed, 'report')).toBeUndefined()
  })

  it('drops malformed stored catalogs rather than applying unknown settings', () => {
    expect(parseTableLayoutPresetCatalog('{"version":1,"presets":{"bad":{"id":"bad","name":"x"}},"automaticByKind":{"report":"bad"}}')).toEqual(emptyTableLayoutPresetCatalog())
  })
})
