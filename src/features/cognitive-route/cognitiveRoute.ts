import { inlineText, type BlockIR, type DocumentIR } from '../export/documentIr'
import type {
  BlockAnchor, CognitiveBlock, CognitiveBlockKind, CognitiveRoute, ReadingBudget, ReadingPurpose,
} from '../../types'

const labels: Record<CognitiveBlockKind, string> = {
  prerequisite: '前置', conclusion: '结论', evidence: '证据', risk: '风险', step: '步骤',
}

const priority: Record<ReadingPurpose, CognitiveBlockKind[]> = {
  'quick-overview': ['conclusion', 'risk', 'evidence', 'prerequisite', 'step'],
  'execution-decision': ['prerequisite', 'conclusion', 'risk', 'evidence', 'step'],
  'follow-steps': ['prerequisite', 'step', 'risk', 'evidence', 'conclusion'],
  'complete-reading': ['prerequisite', 'conclusion', 'evidence', 'risk', 'step'],
}

/** Converts the existing renderer-free DocumentIR into a small, explainable reading grammar. */
export function documentIrToCognitiveBlocks(document: DocumentIR): CognitiveBlock[] {
  const raw: Array<{ text: string; blockType: string; headingPath: string[]; explicitStep: boolean }> = []
  const walk = (blocks: BlockIR[], headings: string[]) => {
    let path = [...headings]
    for (const block of blocks) {
      if (block.kind === 'heading') {
        const heading = compact(inlineText(block.children))
        path = [...path.slice(0, block.depth - 1), heading]
        continue
      }
      if (block.kind === 'list') {
        for (const item of block.items) {
          const itemText = blocksText(item.blocks)
          if (itemText) raw.push({ text: itemText, blockType: 'listItem', headingPath: path, explicitStep: true })
          else walk(item.blocks, path)
        }
        continue
      }
      if (block.kind === 'blockquote') { walk(block.blocks, path); continue }
      const text = blockText(block)
      if (text) raw.push({ text, blockType: block.kind, headingPath: path, explicitStep: false })
    }
  }
  walk(document.blocks, [])

  return raw.map((entry, index) => {
    const previous = raw[index - 1]?.text
    const next = raw[index + 1]?.text
    const contentFingerprint = fingerprint(entry.text)
    const anchor: BlockAnchor = {
      id: `block-${fingerprint(`${entry.blockType}|${entry.headingPath.join('>')}|${entry.text}`)}`,
      contentFingerprint,
      headingPath: entry.headingPath,
      previousFingerprint: previous ? fingerprint(previous) : undefined,
      nextFingerprint: next ? fingerprint(next) : undefined,
      blockType: entry.blockType,
    }
    const classified = classifyBlock(entry.text, entry.headingPath, entry.explicitStep)
    return { anchor, text: entry.text, ...classified }
  })
}

/** Pure rules; the first matching high-confidence signal wins and is retained for UI disclosure. */
export function classifyBlock(text: string, headingPath: string[] = [], explicitStep = false): Pick<CognitiveBlock, 'kind' | 'reason'> {
  const corpus = `${headingPath.join(' ')} ${text}`.toLowerCase()
  if (explicitStep || /(^|\s)(\d+[.)、]|步骤|step\s*\d|首先|然后|接着|最后|执行|运行|安装|配置)/i.test(text)) return { kind: 'step', reason: explicitStep ? '列表项' : '步骤动词或序号' }
  if (/(结论|总结|conclusion|summary)/i.test(headingPath.join(' '))) return { kind: 'conclusion', reason: '结论标题路径' }
  if (/(风险|警告|注意|risk|warning|caution)/i.test(headingPath.join(' '))) return { kind: 'risk', reason: '风险标题路径' }
  if (/(前提|前置|准备|要求|依赖|条件|prerequisite|requirement)/i.test(headingPath.join(' '))) return { kind: 'prerequisite', reason: '前置标题路径' }
  if (/(风险|警告|注意|不要|避免|失败|限制|副作用|danger|warning|caution|must not|should not)/i.test(corpus)) return { kind: 'risk', reason: '风险提示词' }
  if (/(前提|前置|准备|要求|依赖|条件|环境|prerequisite|requirement|before you)/i.test(corpus)) return { kind: 'prerequisite', reason: '前置条件词' }
  if (/(结论|总结|因此|所以|推荐|建议|意味着|结果是|conclusion|summary|recommend)/i.test(corpus)) return { kind: 'conclusion', reason: '结论提示词' }
  return { kind: 'evidence', reason: '默认保留为可追溯事实或论据' }
}

/** Compiles 5–12 ordered source-backed nodes without modifying the document. */
export function buildCognitiveRoute(document: DocumentIR, purpose: ReadingPurpose, budget: ReadingBudget): CognitiveRoute {
  const blocks = documentIrToCognitiveBlocks(document)
  const maxNodes = budget === 5 ? 5 : budget === 15 ? 8 : 12
  const selected: CognitiveBlock[] = []
  for (const kind of priority[purpose]) {
    for (const block of blocks) if (block.kind === kind && selected.length < maxNodes) selected.push(block)
  }
  // Short documents may not contain every signal; retain author-order fallback until the route is useful.
  for (const block of blocks) if (!selected.includes(block) && selected.length < Math.min(maxNodes, Math.max(5, blocks.length))) selected.push(block)
  return {
    purpose, budget,
    nodes: selected.slice(0, 12).map((block) => ({
      id: block.anchor.id, kind: block.kind,
      title: `${labels[block.kind]}：${excerpt(block.text, 42)}`,
      explanation: `${block.reason}；来源：${block.anchor.headingPath.join(' / ') || '文档正文'}`,
      source: block.anchor,
    })),
  }
}

export function fingerprint(value: string): string {
  let hash = 0x811c9dc5
  for (const char of compact(value).toLowerCase()) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) }
  return (hash >>> 0).toString(36)
}

function blockText(block: BlockIR): string {
  switch (block.kind) {
    case 'paragraph': return compact(inlineText(block.children))
    case 'code': return compact(block.value)
    case 'math': return compact(block.value)
    case 'image': return compact(block.alt)
    case 'table': return compact([block.header, ...block.rows].flatMap((row) => row.cells.map((cell) => inlineText(cell.children))).join(' | '))
    default: return ''
  }
}

function blocksText(blocks: BlockIR[]): string { return compact(blocks.map(blockText).filter(Boolean).join(' ')) }
function compact(value: string): string { return value.replace(/\s+/g, ' ').trim() }
function excerpt(value: string, length: number): string { return value.length > length ? `${value.slice(0, length - 1)}…` : value }
