import type { Annotation, TextAnchor } from '../../types'
import { relocateTextAnchor } from './textAnchor'

export type AnnotationRenderStatus = 'located' | 'unavailable'

/** Resolve sidecar anchors before making any purely visual DOM changes. */
export function resolveAnnotationRenderStatus(markdown: string, annotations: readonly Annotation[]): Record<string, AnnotationRenderStatus> {
  return Object.fromEntries(annotations.map((annotation) => [annotation.id, relocateTextAnchor(markdown, annotation.anchor) ? 'located' : 'unavailable']))
}

function normalized(value: string): string { return value.replace(/\s+/g, ' ').trim() }

function unwrapExistingMarks(root: HTMLElement) {
  for (const mark of root.querySelectorAll<HTMLElement>('[data-reader-annotation]')) mark.replaceWith(...Array.from(mark.childNodes))
}

function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement
      return parent && !parent.closest('code, pre, script, style, [data-reader-annotation]') && node.nodeValue?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  let node: Node | null
  while ((node = walker.nextNode())) nodes.push(node as Text)
  return nodes
}

function decorateFirstRenderedQuote(root: HTMLElement, annotation: Annotation): HTMLElement | null {
  const quote = normalized(annotation.anchor.quote)
  if (!quote) return null
  for (const node of textNodes(root)) {
    const raw = node.nodeValue ?? ''
    const directAt = raw.indexOf(annotation.anchor.quote)
    const normalizedAt = directAt < 0 ? normalized(raw).indexOf(quote) : -1
    if (directAt < 0 && normalizedAt < 0) continue
    let start = directAt
    let length = annotation.anchor.quote.length
    if (start < 0) {
      const leading = raw.search(/\S/)
      if (leading < 0) continue
      start = leading + normalizedAt
      length = quote.length
    }
    if (start < 0 || start + length > raw.length) continue
    const mark = document.createElement('mark')
    mark.className = `reader-annotation reader-annotation--${annotation.kind}`
    mark.dataset.readerAnnotation = annotation.id
    mark.tabIndex = 0
    mark.setAttribute('role', 'mark')
    const kindLabel = annotation.kind === 'highlight' ? '高亮批注' : annotation.kind === 'underline' ? '下划线批注' : annotation.kind === 'bookmark' ? '书签' : '边注'
    mark.setAttribute('aria-label', `${kindLabel}：${annotation.note || annotation.anchor.quote}`)
    mark.title = annotation.note || `${kindLabel}`
    mark.textContent = raw.slice(start, start + length)
    const fragment = document.createDocumentFragment()
    if (start) fragment.append(raw.slice(0, start))
    fragment.append(mark)
    if (start + length < raw.length) fragment.append(raw.slice(start + length))
    node.replaceWith(fragment)
    return mark
  }
  return null
}

/** Applies reader-only decorations. It never writes the Markdown model. */
export function applyRenderedAnnotations(root: HTMLElement, markdown: string, annotations: readonly Annotation[]): Record<string, AnnotationRenderStatus> {
  unwrapExistingMarks(root)
  const statuses = resolveAnnotationRenderStatus(markdown, annotations)
  for (const annotation of annotations) if (statuses[annotation.id] === 'located' && !decorateFirstRenderedQuote(root, annotation)) statuses[annotation.id] = 'unavailable'
  return statuses
}

export function findRenderedAnnotation(root: HTMLElement | null, id: string): HTMLElement | null {
  if (!root) return null
  return root.querySelector<HTMLElement>(`[data-reader-annotation="${CSS.escape(id)}"]`)
}

export function anchorCanBeSafelyRendered(markdown: string, anchor: TextAnchor): boolean { return relocateTextAnchor(markdown, anchor) !== null }
