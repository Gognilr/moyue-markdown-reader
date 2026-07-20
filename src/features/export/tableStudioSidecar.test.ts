import { describe, expect, it } from 'vitest'
import { emptyTableStudioSidecar } from './tableStudio'
import { parseTableStudioSidecar, serializeTableStudioSidecar, tableStudioSidecarFileName } from './tableStudioSidecar'

describe('Table Studio sidecar boundary', () => {
  it('uses an adjacent filename and round-trips valid export-only preferences', () => {
    const sidecar = emptyTableStudioSidecar()
    sidecar.tables['table-1234abcd'] = {
      fingerprint: 'table-1234abcd', structureFingerprint: 'table-2345bcde', contentFingerprint: 'table-3456cdef',
      widthOverrides: [undefined, 32], widthStrategy: 'content', wideTableStrategy: 'landscape',
    }
    expect(tableStudioSidecarFileName('C:/docs/report.md')).toBe('report.md.mdreader.tables.json')
    expect(parseTableStudioSidecar(serializeTableStudioSidecar(sidecar))).toEqual(sidecar)
  })

  it('keeps an optional per-document preset choice in the sidecar without touching table identities', () => {
    const sidecar = { ...emptyTableStudioSidecar(), presetId: 'table-preset-report-layout' }
    expect(parseTableStudioSidecar(serializeTableStudioSidecar(sidecar))).toEqual(sidecar)
  })

  it('drops malformed settings instead of guessing', () => {
    expect(parseTableStudioSidecar('{"version":1,"tables":{"table-1234abcd":{"fingerprint":"table-1234abcd","structureFingerprint":"bad","contentFingerprint":"table-3456cdef","widthOverrides":[-1]}}}')).toEqual(emptyTableStudioSidecar())
  })
})
