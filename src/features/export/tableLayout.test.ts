import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from './markdownToIr'
import { planTableLayout } from './tableLayout'
import type { TableIR } from './documentIr'

const table = (markdown: string) => markdownToDocumentIR(markdown).blocks.find((block): block is TableIR => block.kind === 'table')!

describe('Smart Table Studio layout planner', () => {
  it('infers column semantics and default alignment', () => {
    const plan = planTableLayout(table(`| 项目 | 完成率 | 金额 | 日期 | 状态 |\n| --- | --- | --- | --- | --- |\n| A | 80% | $1,200.50 | 2026-07-16 | done |`))
    expect(plan.columns.map((column) => column.kind)).toEqual(['text', 'percentage', 'currency', 'date', 'status'])
    expect(plan.columns.map((column) => column.alignment)).toEqual(['left', 'right', 'right', 'left', 'center'])
  })

  it('assigns the available width exactly and signals a too-narrow page', () => {
    const plan = planTableLayout(table(`| A | B | C | D |\n| --- | --- | --- | --- |\n| very long prose | very long prose | very long prose | very long prose |`), { availableWidth: 20 })
    expect(plan.columns.reduce((sum, column) => sum + column.assignedWidth, 0)).toBeCloseTo(20)
    expect(plan.requiresLandscape).toBe(true)
  })

  it('honours fixed ratios when the table fits', () => {
    const plan = planTableLayout(table(`| A | B |\n| --- | --- |\n| one | two |`), { availableWidth: 60, strategy: 'fixedRatio', fixedRatios: [1, 2] })
    expect(plan.columns[1].assignedWidth / plan.columns[0].assignedWidth).toBeCloseTo(2)
  })
})
