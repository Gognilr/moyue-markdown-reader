import type { LayoutPreferences, ReadingPurpose, ReadingRecoveryCapsule, RecoveryUnderstandingSnapshot } from '../../types'

const STORAGE_PREFIX = 'md-reader:recovery-capsule:'

export interface ReadingSnapshotInput {
  documentKey: string
  markdown: string
  scrollRatio: number
  durationMs: number
  /** Actual rendered heading nearest the viewport; avoids guessing from line count. */
  anchorHeading?: string | null
  /** Actual rendered block nearest the viewport; preferred for semantic relocation. */
  anchorText?: string | null
  collapsedSections?: string[]
  layout?: LayoutPreferences
  readingPurpose?: ReadingPurpose
  understandingEntries?: RecoveryUnderstandingEntry[]
}

/** A minimal projection of the local ledger, kept here to avoid coupling storage formats. */
export interface RecoveryUnderstandingEntry {
  state: RecoveryUnderstandingSnapshot['state']
  headingPath?: string[]
  note?: string
  workflowState?: 'pending-verification' | 'judgement-formed'
  updatedAt: number
}

export interface ResolvedRecoveryPosition {
  index: number
  confidence: 'exact' | 'nearby' | 'heading' | 'ratio'
}

export interface RecoveryDocumentChangeImpact {
  changed: boolean
  message: string
}

/** Creates a compact, semantic local checkpoint rather than persisting raw scroll pixels. */
export function createRecoveryCapsule(input: ReadingSnapshotInput): ReadingRecoveryCapsule {
  const lines = input.markdown.split(/\r?\n/)
  const index = Math.max(0, Math.min(lines.length - 1, Math.round(input.scrollRatio * Math.max(0, lines.length - 1))))
  const heading = input.anchorHeading?.trim() || closestHeading(lines, index)
  const nearbyText = compact(input.anchorText || lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)).join(' ')).slice(0, 280)
  const understanding = summarizeUnderstanding(input.understandingEntries ?? [])
  return {
    version: 2, documentKey: input.documentKey, heading, nearbyText,
    textFingerprint: fingerprint(nearbyText), scrollRatio: clamp(input.scrollRatio),
    durationMs: Math.max(0, Math.round(input.durationMs)), pendingTaskCount: countPendingTasks(input.markdown),
    collapsedSections: [...new Set(input.collapsedSections ?? [])], layout: input.layout,
    readingPurpose: input.readingPurpose, lastUnderstanding: understanding.last,
    unresolvedQuestions: understanding.unresolved, documentFingerprint: fingerprint(compact(input.markdown)), updatedAt: Date.now(),
  }
}

/** Disclosure only: a changed source is surfaced for review, never auto-merged or overwritten. */
export function getRecoveryDocumentChangeImpact(markdown: string, capsule: ReadingRecoveryCapsule): RecoveryDocumentChangeImpact {
  const changed = capsule.documentFingerprint !== fingerprint(compact(markdown))
  return changed
    ? { changed: true, message: '文档自上次阅读后已变化；恢复位置会优先按原文片段定位，请复核此前理解与未解问题。' }
    : { changed: false, message: '文档与上次阅读时一致。' }
}

/** Locates a checkpoint after external edits, preferring exact context then adjacent words and heading. */
export function resolveRecoveryPosition(markdown: string, capsule: ReadingRecoveryCapsule): ResolvedRecoveryPosition {
  const normalized = compact(markdown)
  const quote = compact(capsule.nearbyText)
  const exact = quote ? normalized.indexOf(quote) : -1
  if (exact >= 0) return { index: approximateSourceIndex(markdown, exact), confidence: 'exact' }

  const tokens = quote.split(' ').filter((word) => word.length >= 3)
  const best = bestTokenWindow(normalized, tokens)
  if (best >= 0) return { index: approximateSourceIndex(markdown, best), confidence: 'nearby' }

  if (capsule.heading) {
    const headingAt = markdown.split(/\r?\n/).findIndex((line) => line.replace(/^#{1,6}\s+/, '').trim() === capsule.heading)
    if (headingAt >= 0) return { index: headingAt, confidence: 'heading' }
  }
  return { index: Math.round(clamp(capsule.scrollRatio) * Math.max(0, markdown.split(/\r?\n/).length - 1)), confidence: 'ratio' }
}

export function saveRecoveryCapsule(capsule: ReadingRecoveryCapsule, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): void {
  storage?.setItem(`${STORAGE_PREFIX}${capsule.documentKey}`, JSON.stringify(capsule))
}

export function loadRecoveryCapsule(documentKey: string, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): ReadingRecoveryCapsule | null {
  const raw = storage?.getItem(`${STORAGE_PREFIX}${documentKey}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as LegacyRecoveryCapsule
    if (parsed.documentKey !== documentKey || typeof parsed.nearbyText !== 'string') return null
    return parsed.version === 2 && typeof parsed.documentFingerprint === 'string'
      ? parsed as ReadingRecoveryCapsule
      : parsed.version === 1 ? migrateRecoveryCapsuleV1(parsed) : null
  } catch { return null }
}

export function removeRecoveryCapsule(documentKey: string, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): void {
  storage?.removeItem(`${STORAGE_PREFIX}${documentKey}`)
}

export function formatDuration(durationMs: number): string {
  const minutes = Math.floor(Math.max(0, durationMs) / 60_000)
  return minutes < 1 ? '不足 1 分钟' : minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

function closestHeading(lines: string[], index: number): string | null {
  for (let cursor = index; cursor >= 0; cursor--) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[cursor])
    if (match) return match[2].trim()
  }
  return null
}
function countPendingTasks(markdown: string): number { return (markdown.match(/^\s*[-*+]\s+\[ \]/gm) ?? []).length }
function compact(value: string): string { return value.replace(/\s+/g, ' ').trim() }
function clamp(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) }
function fingerprint(value: string): string { let hash = 0x811c9dc5; for (const char of value.toLowerCase()) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) }; return (hash >>> 0).toString(36) }
function approximateSourceIndex(markdown: string, normalizedIndex: number): number { return markdown.slice(0, Math.min(markdown.length, normalizedIndex)).split(/\r?\n/).length - 1 }
function bestTokenWindow(haystack: string, tokens: string[]): number {
  let bestIndex = -1; let bestScore = 0
  for (const token of tokens) { const index = haystack.indexOf(token); if (index < 0) continue; const window = haystack.slice(Math.max(0, index - 140), index + 280); const score = tokens.filter((candidate) => window.includes(candidate)).length; if (score > bestScore) { bestIndex = index; bestScore = score } }
  return bestScore >= Math.min(2, tokens.length) ? bestIndex : -1
}

function summarizeUnderstanding(entries: RecoveryUnderstandingEntry[]): { last: RecoveryUnderstandingSnapshot | null; unresolved: string[] } {
  const ordered = [...entries].sort((a, b) => b.updatedAt - a.updatedAt)
  const lastEntry = ordered[0]
  const last = lastEntry ? { state: lastEntry.state, heading: lastEntry.headingPath?.at(-1) ?? null, note: lastEntry.note?.trim() || undefined } : null
  const unresolved = ordered
    .filter((entry) => entry.state === 'questioned' || entry.workflowState === 'pending-verification')
    .map((entry) => entry.note?.trim() || `${entry.headingPath?.join(' / ') || '当前阅读块'}（${entry.state === 'questioned' ? '存疑' : '待验证'}）`)
  return { last, unresolved: [...new Set(unresolved)].slice(0, 3) }
}

/** Old prompts remain readable; the next save upgrades them without inventing reader judgements. */
type LegacyRecoveryCapsule = Partial<Omit<ReadingRecoveryCapsule, 'version'>> & { version?: number }

function migrateRecoveryCapsuleV1(legacy: LegacyRecoveryCapsule): ReadingRecoveryCapsule {
  return {
    version: 2, documentKey: legacy.documentKey!, heading: legacy.heading ?? null, nearbyText: legacy.nearbyText!,
    textFingerprint: legacy.textFingerprint ?? fingerprint(legacy.nearbyText!), scrollRatio: clamp(legacy.scrollRatio ?? 0),
    durationMs: Math.max(0, legacy.durationMs ?? 0), pendingTaskCount: Math.max(0, legacy.pendingTaskCount ?? 0),
    collapsedSections: legacy.collapsedSections ?? [], layout: legacy.layout, lastUnderstanding: null,
    unresolvedQuestions: [], documentFingerprint: '', updatedAt: legacy.updatedAt ?? Date.now(),
  }
}
