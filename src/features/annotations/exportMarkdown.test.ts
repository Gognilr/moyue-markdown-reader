import { describe, expect, it } from 'vitest'
import { exportAnnotationsToMarkdown } from './exportMarkdown'

describe('批注 Markdown 导出', () => {
  it('输出摘录、来源和批注说明', () => {
    const result = exportAnnotationsToMarkdown({
      documentTitle: '需求说明',
      excerpts: [{ id: 'e1', content: '关键结论', anchor: { quote: '关键结论', prefix: '', suffix: '', headingPath: ['结论'] }, createdAt: 1 }],
      annotations: [{ id: 'a1', kind: 'note', anchor: { quote: '待确认', prefix: '', suffix: '', headingPath: ['风险'] }, note: '询问负责人', createdAt: 1, updatedAt: 1 }],
    })

    expect(result).toContain('> 关键结论')
    expect(result).toContain('来源：需求说明 · 结论')
    expect(result).toContain('**note**：待确认 · 风险')
    expect(result).toContain('询问负责人')
  })
})
