import { describe, expect, it } from 'vitest'
import { imageType, isSafeRelativeLogo } from './docxLogo'

describe('DOCX company logo source policy', () => {
  it('allows only explicit document-relative raster logos', () => {
    expect(isSafeRelativeLogo('assets/company-logo.png')).toBe(true)
    expect(imageType('assets/company-logo.png')).toBe('png')
    expect(imageType('brand/logo.jpeg')).toBe('jpg')
  })

  it('rejects remote, absolute and traversal logo references', () => {
    expect(isSafeRelativeLogo('https://example.test/logo.png')).toBe(false)
    expect(isSafeRelativeLogo('C:\\brand\\logo.png')).toBe(false)
    expect(isSafeRelativeLogo('../secrets/logo.png')).toBe(false)
    expect(imageType('assets/logo.svg')).toBeUndefined()
  })
})
