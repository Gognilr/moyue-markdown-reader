import { describe, expect, it } from 'vitest'
import { fingerprintText } from './viewportAnchor'

describe('viewport anchor fingerprint', () => {
  it('normalizes whitespace and case for stable matching', () => {
    expect(fingerprintText('  A   useful\nparagraph ')).toBe('a useful paragraph')
  })

  it('bounds a fingerprint so storage stays small', () => {
    expect(fingerprintText('x'.repeat(200))).toHaveLength(120)
  })
})
