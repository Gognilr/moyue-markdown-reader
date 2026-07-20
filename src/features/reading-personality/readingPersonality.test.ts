import { describe, expect, it } from 'vitest'
import { inspectReadingPersonality, suggestReadingPersonality } from './readingPersonality'

describe('reading personality suggestions', () => {
  it('suggests a compact technical layout for code-heavy documents', () => {
    const suggestion = suggestReadingPersonality('```ts\na\n```\n```ts\nb\n```\n```ts\nc\n```')
    expect(suggestion).toMatchObject({ kind: 'technical', preset: 'compact', confidence: 'high' })
  })

  it('prefers a spacious layout for long-form reading', () => {
    const suggestion = suggestReadingPersonality(`# 第一章\n\n${'正文内容。'.repeat(3_100)}`)
    expect(suggestion).toMatchObject({ kind: 'longform', preset: 'spacious' })
  })

  it('keeps rule signals inspectable', () => {
    expect(inspectReadingPersonality('- [ ] A\n- [x] B\n')).toMatchObject({ taskCount: 2, codeBlockCount: 0 })
  })

  it('recognizes API references without requiring a remote service', () => {
    const markdown = '# API\nGET /users\nPOST /users\nDELETE /users/:id\n'
    expect(suggestReadingPersonality(markdown)).toMatchObject({ kind: 'technical', preset: 'compact', confidence: 'high' })
  })
})
