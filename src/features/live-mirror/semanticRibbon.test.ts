import { describe, expect, it } from 'vitest'
import { sampleSemanticItems } from './semanticRibbon'

describe('semantic ribbon sampling', () => {
  it('keeps short ribbons intact', () => {
    expect(sampleSemanticItems([1, 2, 3], 4)).toEqual([1, 2, 3])
  })

  it('bounds long ribbons while preserving both document ends', () => {
    const result = sampleSemanticItems(Array.from({ length: 100 }, (_, index) => index), 10)
    expect(result).toHaveLength(10)
    expect(result[0]).toBe(0)
    expect(result.at(-1)).toBe(99)
    expect(new Set(result).size).toBe(10)
  })
})
