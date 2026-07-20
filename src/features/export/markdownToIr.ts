import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { Content, PhrasingContent, Root } from 'mdast'
import type {
  BlockIR, DocumentIR, InlineIR, ListItemIR, TableCellIR, TableIR, TableRowIR,
} from './documentIr'
import { attachTablePresentation } from './tablePresentation'

/** Parses with the same GFM/math syntax family used by the reader. */
export function markdownToAst(markdown: string): Root {
  return unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown)
}

/** Converts an mdast tree into a renderer-independent, deterministic IR. */
export function markdownAstToDocumentIR(root: Root): DocumentIR {
  return attachTablePresentation({ kind: 'document', blocks: root.children.flatMap(toBlock) })
}

export function markdownToDocumentIR(markdown: string): DocumentIR {
  return markdownAstToDocumentIR(markdownToAst(markdown))
}

function toBlock(node: Content): BlockIR[] {
  switch (node.type) {
    case 'heading':
      return [{ kind: 'heading', depth: node.depth, children: toInline(node.children) }]
    case 'paragraph': {
      const children = toInline(node.children)
      const standalone = children.length === 1 && children[0].kind === 'image' ? children[0] : null
      return standalone
        ? [{ kind: 'image', url: standalone.url, alt: standalone.alt, title: standalone.title }]
        : [{ kind: 'paragraph', children }]
    }
    case 'list':
      return [{
        kind: 'list', ordered: node.ordered === true, start: node.ordered === true ? node.start ?? 1 : undefined,
        items: node.children.map((item): ListItemIR => ({
          checked: item.checked,
          blocks: item.children.flatMap(toBlock),
        })),
      }]
    case 'blockquote':
      return [{ kind: 'blockquote', blocks: node.children.flatMap(toBlock) }]
    case 'code':
      return [{ kind: 'code', language: node.lang ?? undefined, value: node.value, diagram: node.lang === 'mermaid' ? 'mermaid' : undefined }]
    case 'math':
      return [{ kind: 'math', value: node.value, display: true }]
    case 'thematicBreak':
      return [{ kind: 'thematicBreak' }]
    case 'table':
      return [toTable(node)]
    case 'html':
    case 'definition':
      return []
    default:
      return []
  }
}

function toTable(node: Extract<Content, { type: 'table' }>): TableIR {
  const [header, ...rows] = node.children.map((row): TableRowIR => ({
    cells: row.children.map((cell): TableCellIR => ({ children: toInline(cell.children) })),
  }))
  return {
    kind: 'table', align: (node.align ?? []).map((alignment) => alignment ?? null),
    header: header ?? { cells: [] }, rows,
  }
}

function toInline(nodes: PhrasingContent[]): InlineIR[] {
  return nodes.flatMap((node): InlineIR[] => {
    switch (node.type) {
      case 'text': return [{ kind: 'text', value: node.value }]
      case 'emphasis': return [{ kind: 'emphasis', children: toInline(node.children) }]
      case 'strong': return [{ kind: 'strong', children: toInline(node.children) }]
      case 'delete': return [{ kind: 'delete', children: toInline(node.children) }]
      case 'link': return [{ kind: 'link', url: node.url, title: node.title ?? undefined, children: toInline(node.children) }]
      case 'inlineCode': return [{ kind: 'inlineCode', value: node.value }]
      case 'break': return [{ kind: 'break' }]
      case 'inlineMath': return [{ kind: 'math', value: node.value, display: false }]
      case 'image': return [{ kind: 'image', url: node.url, alt: node.alt ?? '', title: node.title ?? undefined }]
      default: return []
    }
  })
}
