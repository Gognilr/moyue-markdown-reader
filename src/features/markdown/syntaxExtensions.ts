/**
 * Opt-in Markdown reading syntax helpers.
 *
 * They deliberately do not alter the application's default renderer. A host can
 * remove the front matter before rendering, add `remarkCallouts`, and render the
 * exported React components where it wants the accompanying reading UI.
 */

export type FrontMatterValue = string | string[]

export interface FrontMatterSummary {
  raw: string
  fields: Record<string, FrontMatterValue>
  body: string
  lineCount: number
}

export interface CalloutBlock {
  kind: string
  title: string
  body: string
  startLine: number
  endLine: number
}

export interface FootnoteDefinition {
  id: string
  text: string
  startLine: number
  referenceCount: number
}

const calloutMarker = /^\s*>\s*\[!([A-Za-z][A-Za-z0-9_-]*)\](?:\s*(.*))?\s*$/
const footnoteDefinition = /^\s*\[\^([^\]\s]+)\]:\s*(.*)$/

/** Parses a conservative YAML front matter subset without executing YAML tags. */
export function parseFrontMatter(markdown: string): FrontMatterSummary | null {
  const normalized = markdown.replace(/^\uFEFF/, '')
  const lines = normalized.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return null

  const closingIndex = lines.slice(1).findIndex((line) => /^(---|\.\.\.)\s*$/.test(line))
  if (closingIndex < 0) return null
  const end = closingIndex + 1
  const raw = lines.slice(1, end).join('\n')
  const fields: Record<string, FrontMatterValue> = {}
  let activeListKey: string | null = null

  for (const line of lines.slice(1, end)) {
    const listItem = /^\s+-\s+(.+?)\s*$/.exec(line)
    if (listItem && activeListKey) {
      const previous = fields[activeListKey]
      fields[activeListKey] = Array.isArray(previous) ? [...previous, unquote(listItem[1])] : [unquote(listItem[1])]
      continue
    }
    const field = /^([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/.exec(line)
    if (!field) { activeListKey = null; continue }
    const [, key, sourceValue] = field
    activeListKey = key
    if (!sourceValue) { fields[key] = []; continue }
    fields[key] = parseScalarOrInlineList(sourceValue)
  }

  return { raw, fields, body: lines.slice(end + 1).join('\n'), lineCount: end + 1 }
}

/** Finds GitHub/Obsidian-style alert blockquotes while preserving source line anchors. */
export function parseCallouts(markdown: string): CalloutBlock[] {
  const lines = markdown.split(/\r?\n/)
  const callouts: CalloutBlock[] = []
  for (let index = 0; index < lines.length; index++) {
    const marker = calloutMarker.exec(lines[index])
    if (!marker) continue
    const body: string[] = []
    let end = index
    for (let next = index + 1; next < lines.length; next++) {
      const quoted = /^\s*>\s?(.*)$/.exec(lines[next])
      if (!quoted) break
      body.push(quoted[1]); end = next
    }
    const kind = marker[1].toLowerCase()
    callouts.push({ kind, title: marker[2]?.trim() || defaultCalloutTitle(kind), body: body.join('\n').trim(), startLine: index + 1, endLine: end + 1 })
    index = end
  }
  return callouts
}

/** Extracts footnote definitions and their in-document reference count. */
export function parseFootnotes(markdown: string): FootnoteDefinition[] {
  const lines = markdown.split(/\r?\n/)
  const definitions = new Map<string, FootnoteDefinition>()
  for (let index = 0; index < lines.length; index++) {
    const match = footnoteDefinition.exec(lines[index])
    if (!match) continue
    const continuation: string[] = []
    let next = index + 1
    while (next < lines.length && /^(?: {2,}|\t)/.test(lines[next])) { continuation.push(lines[next].trim()); next++ }
    const id = match[1]
    definitions.set(id, { id, text: [match[2], ...continuation].join(' ').trim(), startLine: index + 1, referenceCount: 0 })
    index = next - 1
  }
  for (const line of lines) {
    for (const match of line.matchAll(/\[\^([^\]\s]+)\]/g)) {
      const item = definitions.get(match[1])
      if (item && !footnoteDefinition.test(line)) item.referenceCount++
    }
  }
  return [...definitions.values()]
}

/**
 * A small remark transformer for `[!NOTE]`-style blockquotes.
 * It emits semantic `aside` nodes, so a host may style or replace them with
 * `Callout` via react-markdown's component map. This is intentionally opt-in.
 */
export function remarkCallouts() {
  return (tree: MarkdownNode) => visit(tree, transformCallout)
}

interface MarkdownNode {
  type: string
  value?: string
  children?: MarkdownNode[]
  data?: { hName?: string; hProperties?: Record<string, string> }
}

function transformCallout(node: MarkdownNode) {
  if (node.type !== 'blockquote' || !node.children?.length) return
  const first = node.children[0]
  const text = first.type === 'paragraph' ? first.children?.[0] : undefined
  if (!text || text.type !== 'text' || !text.value) return
  const marker = /^\[!([A-Za-z][A-Za-z0-9_-]*)\](?:\s*(.*))?$/.exec(text.value.trim())
  if (!marker) return
  const kind = marker[1].toLowerCase()
  const title = marker[2]?.trim() || defaultCalloutTitle(kind)
  node.data = { ...(node.data ?? {}), hName: 'aside', hProperties: { ...(node.data?.hProperties ?? {}), className: `markdown-callout markdown-callout--${kind}`, 'data-callout': kind, 'data-callout-title': title } }
  if (marker[2]?.trim()) text.value = marker[2].trim()
  else node.children = node.children.slice(1)
}

function visit(node: MarkdownNode, visitor: (node: MarkdownNode) => void) {
  visitor(node)
  node.children?.forEach((child) => visit(child, visitor))
}

function parseScalarOrInlineList(value: string): FrontMatterValue {
  const inline = /^\[(.*)\]$/.exec(value.trim())
  return inline ? inline[1].split(',').map((item) => unquote(item.trim())).filter(Boolean) : unquote(value)
}
function unquote(value: string) { return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2').trim() }
function defaultCalloutTitle(kind: string) { return ({ note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution', danger: 'Danger' } as Record<string, string>)[kind] ?? kind }
