import { describe, expect, it } from 'vitest'
import { codeLineNumberWidth, codeLines } from './codeBlockModel'

describe('code block line model', () => {
  it('preserves blank and trailing source lines for display without changing copy source', () => {
    expect(codeLines('first\n\nlast\n')).toEqual(['first', '', 'last', ''])
  })

  it('calculates a stable gutter width for one through many lines', () => {
    expect(codeLineNumberWidth(1)).toBe(1)
    expect(codeLineNumberWidth(10)).toBe(2)
    expect(codeLineNumberWidth(1000)).toBe(4)
  })
})
