import type { ReadingLayoutPreset, ReadingPersonalitySuggestion } from '../../types'

export interface ReadingPersonalitySignals {
  characters: number
  headingCount: number
  tableCount: number
  codeBlockCount: number
  taskCount: number
  decisionCount: number
  apiReferenceCount: number
}

export function inspectReadingPersonality(markdown: string): ReadingPersonalitySignals {
  const normalized = markdown.replace(/\r\n/g, '\n')
  return {
    characters: normalized.replace(/\s/g, '').length,
    headingCount: (normalized.match(/^#{1,6}\s+/gm) ?? []).length,
    tableCount: (normalized.match(/^\|.*\|\s*$/gm) ?? []).length > 1
      ? Math.floor((normalized.match(/^\|.*\|\s*$/gm) ?? []).length / 2)
      : 0,
    codeBlockCount: (normalized.match(/^```/gm) ?? []).length / 2,
    taskCount: (normalized.match(/^\s*[-*+]\s+\[[ xX]\]/gm) ?? []).length,
    decisionCount: (normalized.match(/(?:^|\n)\s*(?:结论|决定|决议|行动项|下一步|TL;DR|Summary)\b/gi) ?? []).length,
    apiReferenceCount: (normalized.match(/(?:^|\n)\s*(?:GET|POST|PUT|PATCH|DELETE)\s+\/|\b(?:endpoint|request|response|参数|返回值)\b/gi) ?? []).length,
  }
}

/**
 * Transparent, local-only preset suggestion.  It is intentionally a suggestion
 * instead of an automatic mutation, so documents keep their reader's choice.
 */
export function suggestReadingPersonality(markdown: string): ReadingPersonalitySuggestion {
  const signals = inspectReadingPersonality(markdown)
  if (signals.taskCount >= 3 || signals.decisionCount >= 3) {
    return { kind: 'minutes', preset: 'compact', confidence: 'high', reason: '检测到较多待办或决议，紧凑排版便于快速核对。' }
  }
  if (signals.apiReferenceCount >= 3) {
    return { kind: 'technical', preset: 'compact', confidence: 'high', reason: '检测到多个 API 端点或请求/响应契约，建议采用紧凑技术文档排版。' }
  }
  if (signals.codeBlockCount >= 3 || signals.tableCount >= 3) {
    return { kind: 'technical', preset: 'compact', confidence: 'high', reason: '检测到密集代码或表格，建议使用更宽的技术文档排版。' }
  }
  if (signals.characters >= 12_000 || (signals.characters >= 7_000 && signals.headingCount >= 8)) {
    return { kind: 'longform', preset: 'spacious', confidence: 'high', reason: '这是一篇长文，宽松行距有助于连续阅读。' }
  }
  if (/^#\s+.+(?:readme|指南|guide|getting started)/im.test(markdown) || signals.headingCount >= 5) {
    return { kind: 'readme', preset: 'comfortable', confidence: 'medium', reason: '文档结构接近 README 或指南，建议使用舒适阅读排版。' }
  }
  return { kind: 'report', preset: 'comfortable', confidence: 'medium', reason: '使用均衡的报告排版；可随时手动调整。' }
}

export const readingPresetLabel: Record<ReadingLayoutPreset, string> = {
  comfortable: '舒适',
  compact: '紧凑',
  spacious: '宽松',
}
