import { describe, expect, it } from 'vitest'
import { reviewExportMarkdown } from './reviewExport'

describe('review export Markdown', () => {
  it('keeps source context and reviewer notes without a file-system path', () => {
    const result = reviewExportMarkdown({
      documentTitle: '方案',
      excerpts: [{ id: 'e1', content: '关键结论', anchor: { quote: '关键结论', prefix: '', suffix: '', headingPath: ['结论'] }, createdAt: 1 }],
      annotations: [{ id: 'a1', kind: 'note', anchor: { quote: '待确认', prefix: '', suffix: '', headingPath: ['风险'] }, note: '请负责人确认', createdAt: 1, updatedAt: 1 }],
    })
    expect(result).toContain('# 方案 · 审阅记录')
    expect(result).toContain('来源：方案 · 结论')
    expect(result).toContain('**note**：待确认 · 风险')
    expect(result).toContain('意见：请负责人确认')
    expect(result).not.toContain('C:/')
  })
})
