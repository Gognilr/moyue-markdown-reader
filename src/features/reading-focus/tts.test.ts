import { describe, expect, it } from 'vitest'
import { createBrowserTtsEngine, markdownToSpeechText } from './tts'

describe('markdownToSpeechText', () => {
  it('locally omits selected code, links and tables', () => {
    const value = markdownToSpeechText('# 标题\n[链接](https://example.test)\n```js\nsecret()\n```\n| A | B |\n| - | - |\n| 1 | 2 |', { code: true, links: true, tables: true })
    expect(value).toBe('标题')
  })
  it('can describe a table without reading every cell', () => {
    expect(markdownToSpeechText('| A | B |\n| - | - |\n| 1 | 2 |', { tables: true, describeTables: true })).toContain('表格，共 1 行 2 列')
  })
  it('is safe when browser speech is unavailable', () => {
    const engine = createBrowserTtsEngine(undefined)
    expect(engine.availability).toBe('unavailable')
    expect(engine.speak('hello')).toBe(false)
  })
})
