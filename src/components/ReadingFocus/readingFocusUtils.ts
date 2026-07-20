export const AUTO_SCROLL_MIN_SPEED = 12
export const AUTO_SCROLL_MAX_SPEED = 120
export const AUTO_SCROLL_DEFAULT_SPEED = 36

export function clampAutoScrollSpeed(speed: number): number {
  return Math.min(AUTO_SCROLL_MAX_SPEED, Math.max(AUTO_SCROLL_MIN_SPEED, speed))
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]'))
}

export function readingBlockSelector(): string {
  return 'p, li, blockquote, h1, h2, h3, h4, h5, h6, pre, table'
}
