import { describe, expect, it } from 'vitest'
import { changeImageScale, clampImageScale, IMAGE_SCALE, imageScaleLabel } from './imageLightbox'

describe('image lightbox zoom', () => {
  it('clamps every scale to a readable bounded range', () => {
    expect(clampImageScale(-2)).toBe(IMAGE_SCALE.min)
    expect(clampImageScale(99)).toBe(IMAGE_SCALE.max)
    expect(clampImageScale(Number.NaN)).toBe(IMAGE_SCALE.initial)
  })

  it('steps predictably and never exceeds the boundaries', () => {
    expect(changeImageScale(1, 1)).toBe(1.25)
    expect(changeImageScale(IMAGE_SCALE.max, 1)).toBe(IMAGE_SCALE.max)
    expect(changeImageScale(IMAGE_SCALE.min, -1)).toBe(IMAGE_SCALE.min)
  })

  it('uses a compact percentage label for controls', () => {
    expect(imageScaleLabel(1.26)).toBe('126%')
  })
})
