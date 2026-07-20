/** A semantic viewport anchor survives insertions above the current reading position. */
export interface ViewportAnchor {
  headingId?: string
  textFingerprint?: string
  offset: number
}

export function fingerprintText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase().slice(0, 120)
}

export function captureViewportAnchor(container: HTMLElement): ViewportAnchor | null {
  const candidates = [...container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, td')]
  const top = container.getBoundingClientRect().top
  const visible = candidates.find((element) => element.getBoundingClientRect().bottom >= top + 8)
  if (!visible) return null

  const heading = visible.matches('h1, h2, h3, h4, h5, h6')
    ? visible
    : visible.previousElementSibling?.closest<HTMLElement>('h1, h2, h3, h4, h5, h6')
  return {
    headingId: heading?.id || undefined,
    textFingerprint: fingerprintText(visible.innerText || visible.textContent || '') || undefined,
    offset: visible.getBoundingClientRect().top - top,
  }
}

export function findViewportAnchorTarget(container: HTMLElement, anchor: ViewportAnchor): HTMLElement | null {
  if (anchor.textFingerprint) {
    const match = [...container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, td')]
      .find((element) => fingerprintText(element.innerText || element.textContent || '').includes(anchor.textFingerprint!))
    if (match) return match
  }
  return anchor.headingId ? container.querySelector<HTMLElement>(`#${CSS.escape(anchor.headingId)}`) : null
}

export function restoreViewportAnchor(container: HTMLElement, anchor: ViewportAnchor): boolean {
  const target = findViewportAnchorTarget(container, anchor)
  if (!target) return false
  const containerTop = container.getBoundingClientRect().top
  container.scrollTop += target.getBoundingClientRect().top - containerTop - anchor.offset
  return true
}
