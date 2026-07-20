import { describe, expect, it } from 'vitest'
import { canOpenVerifiedLightboxSource } from './lightboxSource'

describe('canOpenVerifiedLightboxSource', () => {
  it('allows only an inspected relative image beside a desktop document', () => {
    const inventory = { 'assets/diagram.png': { exists: true }, 'assets/missing.png': { exists: false } }
    expect(canOpenVerifiedLightboxSource('C:/notes/readme.md', 'assets/diagram.png', inventory)).toBe(true)
    expect(canOpenVerifiedLightboxSource(null, 'assets/diagram.png', inventory)).toBe(false)
    expect(canOpenVerifiedLightboxSource('C:/notes/readme.md', 'assets/missing.png', inventory)).toBe(false)
  })

  it('rejects remote, absolute, traversal and non-image sources', () => {
    for (const reference of ['https://example.com/a.png', 'C:/Windows/a.png', '../secret.png', 'assets/readme.md']) {
      expect(canOpenVerifiedLightboxSource('C:/notes/readme.md', reference, { [reference]: { exists: true } })).toBe(false)
    }
  })
})
