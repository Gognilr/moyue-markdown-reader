import type { Content, Root, TableRow } from 'mdast'
import { markdownToAst } from '../export/markdownToIr'

export type CompareBlockKind = 'heading' | 'paragraph' | 'list-item' | 'table-row' | 'code'
export type CompareChangeKind = 'unchanged' | 'added' | 'removed' | 'modified'

/** A source-backed semantic unit. It deliberately is not a rendered DOM node. */
export interface CompareBlock {
  id: string
  kind: CompareBlockKind
  line: number
  headingPath: string[]
  text: string
  /** Present only for table rows, preserving cell-level review context. */
  cells?: string[]
  /** Table ordinal groups rows from the same Markdown table. */
  tableIndex?: number
}

export interface CompareCellChange {
  index: number
  left: string | null
  right: string | null
  kind: CompareChangeKind
}

export interface CompareEntry {
  id: string
  kind: CompareChangeKind
  left: CompareBlock | null
  right: CompareBlock | null
  cellChanges?: CompareCellChange[]
}

export interface DocumentCompareModel {
  leftLabel: string
  rightLabel: string
  entries: CompareEntry[]
  summary: Record<CompareChangeKind, number>
}

export interface CompareOptions {
  leftLabel?: string
  rightLabel?: string
  /** Zero-based primary-key column used for table rows when it is available. */
  tableKeyColumn?: number
}

/**
 * Compare rendered-document semantics instead of raw source lines. This is pure:
 * callers may use it for disk, saved, or arbitrary text revisions.
 */
export function compareMarkdownDocuments(leftMarkdown: string, rightMarkdown: string, options: CompareOptions = {}): DocumentCompareModel {
  const left = extractCompareBlocks(markdownToAst(leftMarkdown))
  const right = extractCompareBlocks(markdownToAst(rightMarkdown))
  // LCS gives prose a stable document-order alignment.  Tables need one extra
  // pass because a row can be moved independently of the surrounding prose.
  const entries = reconcileTableRowPairs(alignBlocks(left, right, options.tableKeyColumn), options.tableKeyColumn)
  const summary: Record<CompareChangeKind, number> = { unchanged: 0, added: 0, removed: 0, modified: 0 }
  entries.forEach((entry) => { summary[entry.kind] += 1 })
  return { leftLabel: options.leftLabel ?? 'Earlier version', rightLabel: options.rightLabel ?? 'Current version', entries, summary }
}

/** Extracts headings, prose, individual list items, table rows and code blocks with source positions. */
export function extractCompareBlocks(root: Root): CompareBlock[] {
  const blocks: CompareBlock[] = []
  const headingPath: string[] = []
  let nextId = 0
  let tableIndex = 0
  const add = (kind: CompareBlockKind, node: { position?: { start?: { line?: number } } }, text: string, extra: Partial<CompareBlock> = {}) => {
    const normalized = normalize(text)
    if (!normalized && kind !== 'table-row') return
    blocks.push({ id: `${kind}:${nextId++}`, kind, line: node.position?.start?.line ?? 1, headingPath: [...headingPath], text: normalized, ...extra })
  }
  const read = (node: Content) => {
    if (node.type === 'heading') {
      const title = nodeText(node)
      headingPath.splice(Math.max(0, node.depth - 1))
      headingPath[node.depth - 1] = title
      add('heading', node, title)
    } else if (node.type === 'paragraph') add('paragraph', node, nodeText(node))
    else if (node.type === 'code') add('code', node, node.value)
    else if (node.type === 'list') {
      const visitItem = (item: typeof node.children[number]) => {
        const text = item.children.map(nodeText).join(' ')
        add('list-item', item, text)
        item.children.filter((child) => child.type === 'list').forEach(read)
      }
      node.children.forEach(visitItem)
    } else if (node.type === 'table') {
      const index = tableIndex++
      node.children.forEach((row) => addTableRow(row, index, add))
    }
  }
  root.children.forEach(read)
  return blocks
}

function addTableRow(row: TableRow, tableIndex: number, add: (kind: CompareBlockKind, node: TableRow, text: string, extra?: Partial<CompareBlock>) => void) {
  const cells = row.children.map(nodeText).map(normalize)
  add('table-row', row, cells.join(' | '), { cells, tableIndex })
}

function alignBlocks(left: CompareBlock[], right: CompareBlock[], tableKeyColumn?: number): CompareEntry[] {
  const exactPairs = lcsPairs(left, right, (a, b) => exactIdentity(a) === exactIdentity(b))
  const entries: CompareEntry[] = []
  let leftCursor = 0
  let rightCursor = 0
  const emitGap = (leftGap: CompareBlock[], rightGap: CompareBlock[]) => {
    const rightUnused = new Set(rightGap.map((_, index) => index))
    for (const leftBlock of leftGap) {
      const candidate = bestCandidate(leftBlock, rightGap, rightUnused, tableKeyColumn)
      if (candidate === undefined) entries.push(entry('removed', leftBlock, null))
      else {
        rightUnused.delete(candidate)
        const rightBlock = rightGap[candidate]
        entries.push(entry(equalBlock(leftBlock, rightBlock) ? 'unchanged' : 'modified', leftBlock, rightBlock))
      }
    }
    rightUnused.forEach((index) => entries.push(entry('added', null, rightGap[index])))
  }
  for (const [leftIndex, rightIndex] of exactPairs) {
    emitGap(left.slice(leftCursor, leftIndex), right.slice(rightCursor, rightIndex))
    entries.push(entry('unchanged', left[leftIndex], right[rightIndex]))
    leftCursor = leftIndex + 1
    rightCursor = rightIndex + 1
  }
  emitGap(left.slice(leftCursor), right.slice(rightCursor))
  return entries
}

/** LCS preserves document order for all exact rendered blocks. */
function lcsPairs(left: CompareBlock[], right: CompareBlock[], same: (a: CompareBlock, b: CompareBlock) => boolean): Array<[number, number]> {
  const scores = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1))
  for (let a = left.length - 1; a >= 0; a--) for (let b = right.length - 1; b >= 0; b--) scores[a][b] = same(left[a], right[b]) ? scores[a + 1][b + 1] + 1 : Math.max(scores[a + 1][b], scores[a][b + 1])
  const pairs: Array<[number, number]> = []
  for (let a = 0, b = 0; a < left.length && b < right.length;) {
    if (same(left[a], right[b])) { pairs.push([a++, b++]) }
    else if (scores[a + 1][b] >= scores[a][b + 1]) a++
    else b++
  }
  return pairs
}

function bestCandidate(source: CompareBlock, candidates: CompareBlock[], unused: Set<number>, tableKeyColumn?: number): number | undefined {
  let best: number | undefined
  let bestScore = 0
  unused.forEach((index) => {
    const target = candidates[index]
    if (source.kind !== target.kind) return
    const score = blockSimilarity(source, target, tableKeyColumn)
    if (score > bestScore) { best = index; bestScore = score }
  })
  return bestScore >= 0.34 ? best : undefined
}

function blockSimilarity(left: CompareBlock, right: CompareBlock, tableKeyColumn?: number): number {
  if (left.kind === 'table-row' && left.cells && right.cells) {
    if (left.tableIndex !== right.tableIndex) return 0
    if (tableKeyColumn !== undefined && hasTableKey(left, tableKeyColumn) && left.cells[tableKeyColumn] === right.cells[tableKeyColumn]) return 2
    const common = left.cells.filter((cell) => right.cells?.includes(cell)).length
    // Prefer cells that stayed in the same column.  It avoids pairing two rows
    // whose values happen to be the same but whose meanings have shifted.
    const aligned = left.cells.filter((cell, index) => cell === right.cells?.[index]).length
    return (common + aligned) / Math.max(left.cells.length * 2, right.cells.length * 2, 1)
  }
  const a = new Set(tokenize(left.text)); const b = new Set(tokenize(right.text))
  const common = [...a].filter((token) => b.has(token)).length
  const words = common / Math.max(a.size, b.size, 1)
  const sameSection = left.headingPath.join('/') === right.headingPath.join('/') ? 0.2 : 0
  return words + sameSection
}

/**
 * LCS intentionally treats a moved table row as remove + add.  For review that
 * is noisy: a stable primary key (or the highest-scoring row) is stronger
 * evidence, so merge those complementary entries into one modified row.
 */
function reconcileTableRowPairs(entries: CompareEntry[], tableKeyColumn?: number): CompareEntry[] {
  const removed = entries.filter((item): item is CompareEntry & { left: CompareBlock } => item.kind === 'removed' && item.left?.kind === 'table-row')
  const added = entries.filter((item): item is CompareEntry & { right: CompareBlock } => item.kind === 'added' && item.right?.kind === 'table-row')
  const consumed = new Set<CompareEntry>()
  const replacements = new Map<CompareEntry, CompareEntry>()

  // Keyed pairs are unambiguous.  Match these first even if the row moved.
  for (const source of removed) {
    const target = added.find((candidate) => !consumed.has(candidate)
      && source.left.tableIndex === candidate.right.tableIndex
      && tableKeyColumn !== undefined
      && hasTableKey(source.left, tableKeyColumn)
      && source.left.cells![tableKeyColumn] === candidate.right.cells![tableKeyColumn])
    if (target) {
      consumed.add(target)
      replacements.set(source, entry(equalBlock(source.left, target.right) ? 'unchanged' : 'modified', source.left, target.right))
    }
  }

  // Without a key, use the strongest unique row similarity.  Re-evaluate all
  // candidates after every pick so a row cannot be paired twice.
  for (;;) {
    let selected: { source: CompareEntry & { left: CompareBlock }; target: CompareEntry & { right: CompareBlock }; score: number } | undefined
    for (const source of removed) {
      if (replacements.has(source)) continue
      for (const target of added) {
        if (consumed.has(target) || source.left.tableIndex !== target.right.tableIndex) continue
        const score = blockSimilarity(source.left, target.right, undefined)
        if (score >= 0.34 && (!selected || score > selected.score)) selected = { source, target, score }
      }
    }
    if (!selected) break
    consumed.add(selected.target)
    replacements.set(selected.source, entry(equalBlock(selected.source.left, selected.target.right) ? 'unchanged' : 'modified', selected.source.left, selected.target.right))
  }

  return entries.flatMap((item) => {
    const replacement = replacements.get(item)
    if (replacement) return [replacement]
    if (consumed.has(item)) return []
    return [item]
  })
}

function hasTableKey(block: CompareBlock, column: number): boolean {
  const value = block.cells?.[column]
  return typeof value === 'string' && value.trim().length > 0
}

function entry(kind: CompareChangeKind, left: CompareBlock | null, right: CompareBlock | null): CompareEntry {
  const result: CompareEntry = { id: `${left?.id ?? 'none'}:${right?.id ?? 'none'}`, kind, left, right }
  if (left?.kind === 'table-row' && right?.kind === 'table-row') result.cellChanges = compareCells(left.cells ?? [], right.cells ?? [])
  return result
}

function compareCells(left: string[], right: string[]): CompareCellChange[] {
  return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => {
    const a = left[index] ?? null; const b = right[index] ?? null
    return { index, left: a, right: b, kind: a === b ? 'unchanged' : a === null ? 'added' : b === null ? 'removed' : 'modified' }
  })
}

function exactIdentity(block: CompareBlock) { return `${block.kind}:${block.headingPath.join('/')}:${block.text}` }
function equalBlock(left: CompareBlock, right: CompareBlock) { return exactIdentity(left) === exactIdentity(right) }
function normalize(value: string) { return value.replace(/\s+/g, ' ').trim() }
function tokenize(value: string) { return normalize(value).toLocaleLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter(Boolean) }

function nodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const value = (node as { value?: unknown }).value
  if (typeof value === 'string') return value
  const children = (node as { children?: unknown }).children
  return Array.isArray(children) ? children.map(nodeText).join('') : ''
}
