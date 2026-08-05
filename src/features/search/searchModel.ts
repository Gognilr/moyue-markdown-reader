/** Literal, case-insensitive text matching shared by the reader and editor. */
export interface TextSearchMatch {
  start: number
  end: number
}

export function findTextMatches(text: string, query: string): TextSearchMatch[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []

  const haystack = text.toLocaleLowerCase()
  const matches: TextSearchMatch[] = []
  let cursor = 0
  while (cursor <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, cursor)
    if (start < 0) break
    matches.push({ start, end: start + needle.length })
    cursor = start + needle.length
  }
  return matches
}

export function nextTextMatchIndex(
  matches: readonly TextSearchMatch[],
  currentIndex: number,
  direction: 1 | -1,
): number {
  if (matches.length === 0) return -1
  if (currentIndex < 0 || currentIndex >= matches.length) return direction === 1 ? 0 : matches.length - 1
  return (currentIndex + direction + matches.length) % matches.length
}
