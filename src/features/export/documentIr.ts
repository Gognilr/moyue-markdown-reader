/**
 * Export-facing document model.  This deliberately contains no React or DOM
 * references so DOCX and PDF backends can consume exactly the same semantics.
 */
export interface DocumentIR {
  kind: 'document'
  blocks: BlockIR[]
}

export type BlockIR =
  | HeadingIR
  | ParagraphIR
  | ListIR
  | BlockquoteIR
  | CodeBlockIR
  | MathBlockIR
  | ThematicBreakIR
  | ImageIR
  | TableIR

export interface HeadingIR {
  kind: 'heading'
  depth: 1 | 2 | 3 | 4 | 5 | 6
  children: InlineIR[]
}

export interface ParagraphIR {
  kind: 'paragraph'
  children: InlineIR[]
}

export interface ListIR {
  kind: 'list'
  ordered: boolean
  start?: number
  items: ListItemIR[]
}

export interface ListItemIR {
  checked?: boolean | null
  blocks: BlockIR[]
}

export interface BlockquoteIR {
  kind: 'blockquote'
  blocks: BlockIR[]
}

export interface CodeBlockIR {
  kind: 'code'
  language?: string
  value: string
  /** A later backend may render this as a native chart instead of code. */
  diagram?: 'mermaid'
}

export interface MathBlockIR {
  kind: 'math'
  value: string
  display: true
}

export interface ThematicBreakIR { kind: 'thematicBreak' }

export interface ImageIR {
  kind: 'image'
  url: string
  alt: string
  title?: string
}

export interface TableIR {
  kind: 'table'
  align: Array<'left' | 'center' | 'right' | null>
  header: TableRowIR
  rows: TableRowIR[]
  /**
   * Export-only narrative kept adjacent to a GFM table.  It is populated only
   * from explicit conventional markers (for example `表 1：...` or `来源：...`),
   * so ordinary paragraphs are never silently reclassified.
   */
  presentation?: TablePresentationIR
}

export interface TablePresentationIR {
  /** Author-supplied caption text, without its `表/Table n` marker. */
  caption?: string
  /** Explicit notes following the table. */
  notes: string[]
  /** Explicit source lines following the table. */
  sources: string[]
}

export interface TableRowIR { cells: TableCellIR[] }

export interface TableCellIR { children: InlineIR[] }

export type InlineIR =
  | { kind: 'text'; value: string }
  | { kind: 'emphasis'; children: InlineIR[] }
  | { kind: 'strong'; children: InlineIR[] }
  | { kind: 'delete'; children: InlineIR[] }
  | { kind: 'link'; url: string; title?: string; children: InlineIR[] }
  | { kind: 'image'; url: string; alt: string; title?: string }
  | { kind: 'inlineCode'; value: string }
  | { kind: 'break' }
  | { kind: 'math'; value: string; display: false }

export const inlineText = (children: InlineIR[]): string => children.map((child) => {
  switch (child.kind) {
    case 'text':
    case 'inlineCode':
    case 'math':
      return child.value
    case 'break':
      return '\n'
    case 'image':
      return child.alt
    default:
      return inlineText(child.children)
  }
}).join('')
