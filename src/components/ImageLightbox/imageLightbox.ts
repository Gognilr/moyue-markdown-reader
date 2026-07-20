export const IMAGE_SCALE = {
  min: 0.25,
  max: 4,
  step: 0.25,
  initial: 1,
} as const

/** Keep image zoom deterministic and independent from the rendering surface. */
export function clampImageScale(scale: number): number {
  return Math.min(IMAGE_SCALE.max, Math.max(IMAGE_SCALE.min, Number.isFinite(scale) ? scale : IMAGE_SCALE.initial))
}

export function changeImageScale(current: number, direction: 1 | -1): number {
  return clampImageScale(Math.round((current + direction * IMAGE_SCALE.step) * 100) / 100)
}

export function imageScaleLabel(scale: number): string {
  return `${Math.round(clampImageScale(scale) * 100)}%`
}
