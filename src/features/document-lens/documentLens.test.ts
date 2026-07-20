import { describe, expect, it } from 'vitest'
import { buildDocumentLens, filterDocumentLens, groupDocumentLens } from './documentLens'

const source = `# 发布报告

## TL;DR
最终方案是灰度发布。

## 风险
警告：不要在高峰期迁移。

## 操作
- [ ] 负责人确认回滚窗口
\`npm run deploy\`
\`P95 下降 30%\`

| 指标 | 值 |
| --- | --- |
| 可用性 | 99.9% |`

describe('document lens', () => {
  it('extracts source-backed conclusion, risk, action, command and data locally', () => {
    const items = buildDocumentLens(source)
    expect(filterDocumentLens(items, 'conclusion').map((item) => item.text)).toContain('最终方案是灰度发布。')
    expect(filterDocumentLens(items, 'risk').map((item) => item.text)).toContain('警告：不要在高峰期迁移。')
    expect(filterDocumentLens(items, 'action').map((item) => item.text)).toContain('负责人确认回滚窗口')
    expect(filterDocumentLens(items, 'command').map((item) => item.text)).toContain('`npm run deploy`')
    expect(filterDocumentLens(items, 'data').some((item) => item.text.includes('99.9%'))).toBe(true)
  })

  it('supports local text filtering and heading grouping without AI', () => {
    const items = buildDocumentLens(source)
    const result = filterDocumentLens(items, 'all', '迁移')
    expect(result).toHaveLength(1)
    expect(groupDocumentLens(result)).toEqual([{ heading: '发布报告 / 风险', items: result }])
  })

  it('deterministically collects command and data source forms without changing Markdown', () => {
    const sourceWithForms = `# 运维手册

## 命令

\`\`\`bash
npm run release
\`\`\`
API_PORT=4310
保存使用 Ctrl+S。

## 数据

| 日期 | 转化率 |
| --- | --- |
| 周一 | 82.5% |

![趋势图](./trend.png)
来源：[运行报告](https://example.test/report)

\`\`\`mermaid
graph LR
A --> B
\`\`\``
    const items = buildDocumentLens(sourceWithForms)
    const commands = filterDocumentLens(items, 'command')
    const data = filterDocumentLens(items, 'data')

    expect(commands.map((item) => item.reason)).toEqual(expect.arrayContaining(['围栏代码块（bash）', '配置项', '键盘快捷键']))
    expect(data.map((item) => item.reason)).toEqual(expect.arrayContaining(['Markdown 表格', '图表引用', '引用来源', '图表定义代码块（mermaid）']))
    expect(commands.every((item) => item.line > 0 && item.headingPath[0] === '运维手册')).toBe(true)
    expect(data.find((item) => item.reason === 'Markdown 表格')?.text).toContain('82.5%')
  })
})
