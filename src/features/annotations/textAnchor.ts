import type { TextAnchor } from '../../types'

const CONTEXT_LENGTH = 80
const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm

export interface AnchorLocation {
  start: number
  end: number
  confidence: number
}

interface Heading {
  level: number
  text: string
  index: number
}

function headingsBefore(source: string, position: number): Heading[] {
  const headings: Heading[] = []
  for (const match of source.matchAll(headingPattern)) {
    if ((match.index ?? 0) >= position) break
    headings.push({ level: match[1].length, text: match[2].trim(), index: match.index ?? 0 })
  }
  return headings
}

/** 返回选择位置所属的 Markdown 标题层级。 */
export function getHeadingPath(source: string, position: number): string[] {
  const path: Heading[] = []
  for (const heading of headingsBefore(source, position)) {
    while (path.length && path[path.length - 1].level >= heading.level) path.pop()
    path.push(heading)
  }
  return path.map((heading) => heading.text)
}

export function createTextAnchor(source: string, start: number, end: number): TextAnchor {
  const safeStart = Math.max(0, Math.min(start, source.length))
  const safeEnd = Math.max(safeStart, Math.min(end, source.length))
  const quote = source.slice(safeStart, safeEnd)
  if (!quote) throw new Error('无法为零长度文本创建锚点')

  return {
    quote,
    prefix: source.slice(Math.max(0, safeStart - CONTEXT_LENGTH), safeStart),
    suffix: source.slice(safeEnd, safeEnd + CONTEXT_LENGTH),
    headingPath: getHeadingPath(source, safeStart),
  }
}

function commonSuffixLength(left: string, right: string): number {
  let count = 0
  while (count < left.length && count < right.length && left[left.length - 1 - count] === right[right.length - 1 - count]) count += 1
  return count
}

function commonPrefixLength(left: string, right: string): number {
  let count = 0
  while (count < left.length && count < right.length && left[count] === right[count]) count += 1
  return count
}

/**
 * 在新版本文本中重新定位锚点。相同选中文本出现多次时，前后文和标题路径共同决定最佳候选。
 */
export function relocateTextAnchor(source: string, anchor: TextAnchor): AnchorLocation | null {
  if (!anchor.quote) return null

  const candidates: AnchorLocation[] = []
  let start = source.indexOf(anchor.quote)
  while (start !== -1) {
    const end = start + anchor.quote.length
    const prefixScore = commonSuffixLength(anchor.prefix, source.slice(Math.max(0, start - anchor.prefix.length), start))
    const suffixScore = commonPrefixLength(anchor.suffix, source.slice(end, end + anchor.suffix.length))
    const contextLength = anchor.prefix.length + anchor.suffix.length
    const contextScore = contextLength ? (prefixScore + suffixScore) / contextLength : 1
    const headingScore = anchor.headingPath.length && getHeadingPath(source, start).join('\u0000') === anchor.headingPath.join('\u0000') ? 1 : 0
    candidates.push({ start, end, confidence: Math.min(1, 0.85 * contextScore + 0.15 * headingScore) })
    start = source.indexOf(anchor.quote, start + 1)
  }

  if (!candidates.length) return null
  return candidates.sort((left, right) => right.confidence - left.confidence || left.start - right.start)[0]
}
