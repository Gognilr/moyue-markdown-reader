import GithubSlugger from 'github-slugger'

export const LARGE_DOCUMENT_CHARACTER_THRESHOLD = 500_000
export const LARGE_DOCUMENT_TARGET_LINES = 700

export interface LargeDocumentPage {
  index: number
  startLine: number
  endLine: number
  markdown: string
}

export interface LargeDocumentModel {
  pages: LargeDocumentPage[]
  headingPageById: ReadonlyMap<string, number>
}

export function isLargeMarkdown(markdown: string): boolean {
  return markdown.length >= LARGE_DOCUMENT_CHARACTER_THRESHOLD
}

function collectPageStarts(lines: string[]): number[] {
  const starts = [0]
  let inFence = false
  let fenceMarker = ''
  let lastBreak = 0

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trimStart()
    const fence = trimmed.match(/^(```+|~~~+)/)?.[1]
    if (fence) {
      if (!inFence) {
        inFence = true
        fenceMarker = fence[0]
      } else if (fence[0] === fenceMarker) {
        inFence = false
      }
      continue
    }
    if (inFence || index - lastBreak < LARGE_DOCUMENT_TARGET_LINES) continue
    if (/^#{1,2}\s+/.test(trimmed)) {
      starts.push(index)
      lastBreak = index
    }
  }

  // Documents without useful headings still need bounded rendering. Prefer a
  // paragraph boundary; a single enormous fenced block remains atomic so its
  // Markdown semantics are not silently corrupted.
  if (starts.length === 1 && lines.length > LARGE_DOCUMENT_TARGET_LINES) {
    inFence = false
    fenceMarker = ''
    lastBreak = 0
    for (let index = 0; index < lines.length; index += 1) {
      const trimmed = lines[index].trimStart()
      const fence = trimmed.match(/^(```+|~~~+)/)?.[1]
      if (fence) {
        if (!inFence) { inFence = true; fenceMarker = fence[0] }
        else if (fence[0] === fenceMarker) inFence = false
      }
      if (!inFence && index - lastBreak >= LARGE_DOCUMENT_TARGET_LINES && lines[index].trim() === '') {
        starts.push(index + 1)
        lastBreak = index + 1
      }
    }
  }
  return starts
}

export function createLargeDocumentModel(markdown: string): LargeDocumentModel {
  if (!isLargeMarkdown(markdown)) {
    return { pages: [{ index: 0, startLine: 0, endLine: markdown.split('\n').length, markdown }], headingPageById: new Map() }
  }

  const lines = markdown.split('\n')
  const starts = collectPageStarts(lines)
  const pages = starts.map((startLine, index) => {
    const endLine = starts[index + 1] ?? lines.length
    return { index, startLine, endLine, markdown: lines.slice(startLine, endLine).join('\n') }
  })
  const headingPageById = new Map<string, number>()
  const slugger = new GithubSlugger()
  let pageIndex = 0
  let inFence = false
  let fenceMarker = ''

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    while (pageIndex + 1 < pages.length && lineIndex >= pages[pageIndex + 1].startLine) pageIndex += 1
    const trimmed = lines[lineIndex].trimStart()
    const fence = trimmed.match(/^(```+|~~~+)/)?.[1]
    if (fence) {
      if (!inFence) { inFence = true; fenceMarker = fence[0] }
      else if (fence[0] === fenceMarker) inFence = false
      continue
    }
    if (inFence) continue
    const heading = trimmed.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (heading) headingPageById.set(slugger.slug(heading[1]), pageIndex)
  }
  return { pages, headingPageById }
}
