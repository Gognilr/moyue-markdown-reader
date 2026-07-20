import type { DocumentLensItem } from '../../types'

/** Exact source extract retained by the local lens. No normalization is done before copying. */
export function documentLensOriginal(item: DocumentLensItem): string {
  return item.text
}

/** A portable citation that keeps the source file, heading path and one-based line. */
export function documentLensSourceCitation(item: DocumentLensItem, documentLabel: string): string {
  const heading = item.headingPath.length ? ` > ${item.headingPath.join(' > ')}` : ''
  return `${documentLabel}${heading}（第 ${item.line} 行）\n${item.text}`
}
