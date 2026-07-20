import GithubSlugger from 'github-slugger'

export interface LiveMirrorHeadingAnchor {
  /** One-based source line of the Markdown heading. */
  line: number
  depth: number
  text: string
  /** Matches the `rehype-slug` id in the rendered preview. */
  id: string
}

function plainHeadingText(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[~*_`]/g, '')
    .trim()
}

/**
 * Produces the same GitHub-style ids as the existing `rehype-slug` renderer for
 * ATX headings. Fenced examples are deliberately ignored: a line that looks
 * like a heading inside code must never become a navigation target.
 */
export function collectLiveMirrorHeadingAnchors(markdown: string): LiveMirrorHeadingAnchor[] {
  const anchors: LiveMirrorHeadingAnchor[] = []
  const slugger = new GithubSlugger()
  let inFence = false
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) continue
    const text = plainHeadingText(match[2])
    if (!text) continue
    anchors.push({ line: index + 1, depth: match[1].length, text, id: slugger.slug(text) })
  }
  return anchors
}

/** Returns the nearest preceding title, making a source-line jump chapter-aware. */
export function headingContextAtLine(anchors: readonly LiveMirrorHeadingAnchor[], line: number): LiveMirrorHeadingAnchor | null {
  let context: LiveMirrorHeadingAnchor | null = null
  for (const anchor of anchors) {
    if (anchor.line > line) break
    context = anchor
  }
  return context
}
