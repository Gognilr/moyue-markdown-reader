import { inlineText, type BlockIR, type DocumentIR, type TableIR } from './documentIr'

const caption = /^(?:table|表)\s*(?:\d+)?\s*(?:[.:：、-]\s*)?(.+)$/i
const note = /^(?:note|notes|注|备注)\s*[:：]\s*(.+)$/i
const source = /^(?:source|来源)\s*[:：]\s*(.+)$/i

/**
 * Promotes only clearly-labelled table narrative into table-local export
 * semantics.  The marked paragraphs are removed from the ordinary stream so
 * an export does not print a caption/note twice.  The input IR stays immutable.
 */
export function attachTablePresentation(ir: DocumentIR): DocumentIR {
  const blocks: BlockIR[] = []
  for (let index = 0; index < ir.blocks.length; index += 1) {
    const block = ir.blocks[index]
    if (block.kind !== 'table') { blocks.push(block); continue }
    const previous = blocks.at(-1)
    const priorCaption = previous?.kind === 'paragraph' ? parseCaption(inlineText(previous.children)) : undefined
    if (priorCaption && previous) blocks.pop()

    const notes: string[] = []
    const sources: string[] = []
    let cursor = index + 1
    while (cursor < ir.blocks.length) {
      const following = ir.blocks[cursor]
      if (following.kind !== 'paragraph') break
      const text = inlineText(following.children).trim()
      const parsedNote = parseNote(text)
      const parsedSource = parseSource(text)
      if (parsedNote) notes.push(parsedNote)
      else if (parsedSource) sources.push(parsedSource)
      else break
      cursor += 1
    }
    const presentation = priorCaption || notes.length || sources.length
      ? { caption: priorCaption, notes, sources }
      : undefined
    blocks.push({ ...block, presentation })
    index = cursor - 1
  }
  return { ...ir, blocks }
}

export interface ResolvedTablePresentation {
  number: number
  caption: string
  notes: readonly string[]
  sources: readonly string[]
}

/** Numbering remains deterministic even when some tables have no caption. */
export function resolveTablePresentation(table: TableIR, number: number): ResolvedTablePresentation {
  return {
    number,
    caption: table.presentation?.caption?.trim() || '',
    notes: table.presentation?.notes ?? [],
    sources: table.presentation?.sources ?? [],
  }
}

function parseCaption(value: string): string | undefined {
  const match = value.trim().match(caption)
  return match?.[1]?.trim() || undefined
}
function parseNote(value: string): string | undefined { return value.match(note)?.[1]?.trim() || undefined }
function parseSource(value: string): string | undefined { return value.match(source)?.[1]?.trim() || undefined }
