import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from './markdownToIr'
import type { TableIR } from './documentIr'
import { chooseWideTableStrategy, describeTable, emptyTableStudioSidecar, planStudioTable, reassociateTableSettings, withColumnWidth, withTableSettings } from './tableStudio'

const getTable = (markdown: string): TableIR => markdownToDocumentIR(markdown).blocks.find((block): block is TableIR => block.kind === 'table')!

describe('Smart Table Studio sidecar and preview model', () => {
  it('keeps manual column widths in a sidecar and applies them without changing the table', () => {
    const source = '| Name | Notes |\n| --- | --- |\n| A | very long explanation |'
    const input = getTable(source)
    const descriptor = describeTable(input)
    const sidecar = withColumnWidth(emptyTableStudioSidecar(), descriptor, 1, 48, 2)
    const layout = planStudioTable(input, sidecar, { availableWidth: 60 })

    expect(source).toContain('very long explanation')
    expect(layout.manualWidthsApplied).toBe(true)
    expect(layout.columns[1].assignedWidth).toBeGreaterThan(layout.columns[0].assignedWidth)
    expect(sidecar.tables[descriptor.fingerprint].widthOverrides).toEqual([undefined, 48])
  })

  it('reconnects a unique table setting when its content fingerprint changes', () => {
    const before = getTable('| Name | Value |\n| --- | --- |\n| A | 1 |')
    const after = getTable('| Name | Value |\n| --- | --- |\n| A | 2 |')
    const beforeDescriptor = describeTable(before)
    const saved = withColumnWidth(emptyTableStudioSidecar(), beforeDescriptor, 1, 30, 2)
    const reconnected = reassociateTableSettings(saved, [after])
    const afterDescriptor = describeTable(after)

    expect(afterDescriptor.contentFingerprint).not.toBe(beforeDescriptor.contentFingerprint)
    expect(reconnected.tables[afterDescriptor.fingerprint]?.widthOverrides).toEqual([undefined, 30])
  })

  it('does not guess when multiple sidecar entries have the same structure', () => {
    const first = getTable('| Name | Value |\n| --- | --- |\n| A | 1 |')
    const second = getTable('| Name | Value |\n| --- | --- |\n| B | 2 |')
    const changed = getTable('| Name | Value |\n| --- | --- |\n| C | 3 |')
    const one = describeTable(first)
    const two = describeTable(second)
    let saved = withColumnWidth(emptyTableStudioSidecar(), one, 0, 20, 2)
    saved = withColumnWidth(saved, two, 1, 20, 2)

    expect(reassociateTableSettings(saved, [changed]).tables).toEqual({})
  })

  it('offers previewable wide-table alternatives in a stable priority order', () => {
    const decision = chooseWideTableStrategy(100, 80)
    expect(decision.recommended).toBe('landscape')
    expect(decision.previews.map((preview) => preview.strategy)).toEqual(['landscape', 'narrowMargins', 'smallerFont', 'splitLinked'])
    expect(decision.previews[0].fits).toBe(true)
    expect(decision.previews[1].fits).toBe(false)
  })

  it('uses a layout preset as a default while keeping a table-specific exception authoritative', () => {
    const table = getTable('| Name | Value |\n| --- | --- |\n| A | 1 |')
    const descriptor = describeTable(table)
    const sidecar = withTableSettings(emptyTableStudioSidecar(), descriptor, { widthStrategy: 'equal' })
    const layout = planStudioTable(table, sidecar, { availableWidth: 60 }, 0, { widthStrategy: 'content', wideTableStrategy: 'landscape' })

    expect(layout.settings).toMatchObject({ widthStrategy: 'equal', wideTableStrategy: 'landscape' })
  })
})
