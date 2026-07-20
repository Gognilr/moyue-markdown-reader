import GithubSlugger from 'github-slugger'

export type SemanticKind = 'heading' | 'code' | 'image' | 'table' | 'task'

export interface SemanticItem {
  kind: SemanticKind
  /** Zero-based occurrence within its rendered DOM selector. */
  occurrence: number
  label: string
  id?: string
}

/** Keeps the ribbon bounded without introducing a second scrollbar. */
export function sampleSemanticItems<T>(items: readonly T[], limit: number): T[] {
  if (limit <= 0 || items.length === 0) return []
  if (items.length <= limit) return [...items]
  if (limit === 1) return [items[0]]
  return Array.from({ length: limit }, (_, index) =>
    items[Math.round(index * (items.length - 1) / (limit - 1))])
}

const labels: Record<SemanticKind, string> = {
  heading: '标题',
  code: '代码',
  image: '图片',
  table: '表格',
  task: '任务',
}

function plainText(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[~*_`]/g, '')
    .trim()
}

/**
 * A deliberately small Markdown scanner used for navigation only. Rendering remains
 * owned by react-markdown, so an external-file refresh cannot leave this model stale.
 */
export function getSemanticItems(markdown: string): SemanticItem[] {
  const items: SemanticItem[] = []
  const counts: Record<SemanticKind, number> = { heading: 0, code: 0, image: 0, table: 0, task: 0 }
  const slugger = new GithubSlugger()
  const lines = markdown.split(/\r?\n/)
  let inFence = false

  const push = (kind: SemanticKind, label: string, id?: string) => {
    items.push({ kind, occurrence: counts[kind]++, label: label || labels[kind], id })
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fence = line.match(/^\s*(```|~~~)\s*([^\s]*)/)
    if (fence) {
      // Mermaid is rendered as a diagram rather than a code block by the existing view.
      if (!inFence && fence[2].toLowerCase() !== 'mermaid') push('code', fence[2] ? `${fence[2]} 代码块` : '代码块')
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      const text = plainText(heading[2])
      push('heading', text, slugger.slug(text))
    }
    const task = line.match(/^\s*[-*+]\s+\[[ xX]\]\s+(.+)$/)
    if (task) push('task', plainText(task[1]))
    const imagePattern = /!\[([^\]]*)\]\([^)]*\)/g
    let image: RegExpExecArray | null
    while ((image = imagePattern.exec(line)) !== null) push('image', image[1] || '图片')

    // A GFM table begins at the header row immediately before its separator row.
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line) && index > 0) {
      push('table', plainText(lines[index - 1]).replace(/\|/g, ' · '))
    }
  }
  return items
}

export function semanticSelector(kind: SemanticKind) {
  switch (kind) {
    case 'heading': return 'h1, h2, h3, h4, h5, h6'
    case 'code': return '.code-block, pre'
    case 'image': return 'img'
    case 'table': return '.table-lens'
    case 'task': return 'li:has(input[type="checkbox"])'
  }
}

export const semanticKindLabels = labels
