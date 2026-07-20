import type { BlockAnchor, ReadingPurpose } from '../../types'

/** Explicit reader-owned states. None of these are inferred from scrolling or AI output. */
export type ReadingUnderstandingState = 'understood' | 'questioned' | 'skipped' | 'disagreed'

/**
 * A separate, reader-owned follow-up state.  This deliberately does not extend
 * `ReadingUnderstandingState`: verification and forming a judgement are tasks
 * the reader may choose to do after (or without) any of the four understanding
 * marks above.
 */
export type ReadingWorkflowState = 'pending-verification' | 'judgement-formed'

export interface ReadingLedgerEntry {
  id: string
  /** The route/source anchor at the time the reader made the decision. */
  anchor: BlockAnchor
  state: ReadingUnderstandingState
  workflowState?: ReadingWorkflowState
  /** The reading goal is context, not a claim that the document was completed. */
  purpose?: ReadingPurpose
  note?: string
  createdAt: number
  updatedAt: number
}

export interface ReadingLedgerNudgeDismissal {
  id: string
  dismissedAt: number
}

/** Local, single-document reading memory. It intentionally contains no cross-document index. */
export interface DocumentReadingLedger {
  schema: 'md-reader.reading-ledger'
  version: 2
  documentKey: string
  entries: ReadingLedgerEntry[]
  dismissedNudges: ReadingLedgerNudgeDismissal[]
  updatedAt: number
}

export interface ReadingBehaviorSignal {
  kind: 'revisit' | 'long-pause' | 'repeated-search' | 'backtrack'
  anchor: BlockAnchor
  /** Caller-owned heuristic confidence from 0 to 1. It must never set an understanding state. */
  confidence: number
}

export interface LowConfidenceNudge {
  id: string
  kind: ReadingBehaviorSignal['kind']
  anchor: BlockAnchor
  confidence: number
  dismissible: true
  message: string
}

export interface ReadingLedgerImpact {
  entryId: string
  anchor: BlockAnchor
  state: ReadingUnderstandingState
  status: 'still-located' | 'changed-or-missing'
  /** A changed source may affect a prior judgement; the reader must review it. */
  requiresReview: boolean
}

export interface ReadingLedgerImpactReport {
  documentKey: string
  impacts: ReadingLedgerImpact[]
  changedCount: number
}

export function createEmptyReadingLedger(documentKey: string, now = Date.now()): DocumentReadingLedger {
  return { schema: 'md-reader.reading-ledger', version: 2, documentKey, entries: [], dismissedNudges: [], updatedAt: now }
}

/** Adds or replaces one deliberate decision for the same stable source anchor. */
export function recordReadingState(
  ledger: DocumentReadingLedger,
  input: Pick<ReadingLedgerEntry, 'anchor' | 'state' | 'purpose' | 'note'>,
  now = Date.now(),
): DocumentReadingLedger {
  const id = entryIdFor(input.anchor)
  const note = input.note?.trim() || undefined
  const current = ledger.entries.find((entry) => entry.id === id)
  const entry: ReadingLedgerEntry = current
    ? { ...current, ...input, id, note, updatedAt: now }
    : { ...input, id, note, createdAt: now, updatedAt: now }
  return { ...ledger, entries: ledger.entries.map((item) => item.id === id ? entry : item).concat(current ? [] : entry), updatedAt: now }
}

export function removeReadingState(ledger: DocumentReadingLedger, entryId: string, now = Date.now()): DocumentReadingLedger {
  return { ...ledger, entries: ledger.entries.filter((entry) => entry.id !== entryId), updatedAt: now }
}

/**
 * Records an explicit follow-up choice without changing the reader's original
 * understanding state, anchor, purpose, or note.  No caller may infer this
 * value from scrolling, task completion, or an AI response.
 */
export function setReadingWorkflowState(
  ledger: DocumentReadingLedger,
  entryId: string,
  workflowState: ReadingWorkflowState | undefined,
  now = Date.now(),
): DocumentReadingLedger {
  let changed = false
  const entries = ledger.entries.map((entry) => {
    if (entry.id !== entryId) return entry
    changed = true
    return { ...entry, workflowState, updatedAt: now }
  })
  return changed ? { ...ledger, entries, updatedAt: now } : ledger
}

/**
 * Exposes only the reader's explicit marks for source-oriented views such as a
 * Cognitive Route.  A route can display or update these marks, but may never
 * infer one from route progress, scrolling, or task completion.
 */
export function readingStatesByAnchor(ledger: Pick<DocumentReadingLedger, 'entries'> | null | undefined): Readonly<Record<string, ReadingUnderstandingState>> {
  return Object.fromEntries((ledger?.entries ?? []).map((entry) => [entry.anchor.id, entry.state]))
}

/**
 * Produces a non-authoritative, dismissible hint. A behavior signal never writes
 * `understood` (or any other reader state), and low-confidence signals are the only
 * ones surfaced so they remain optional help rather than a reading requirement.
 */
export function suggestLowConfidenceNudge(ledger: DocumentReadingLedger, signal: ReadingBehaviorSignal): LowConfidenceNudge | null {
  const confidence = clamp(signal.confidence)
  if (confidence <= 0 || confidence >= 0.75) return null
  const id = `nudge:${signal.kind}:${signal.anchor.id}`
  if (ledger.dismissedNudges.some((dismissal) => dismissal.id === id)) return null
  return { id, kind: signal.kind, anchor: signal.anchor, confidence, dismissible: true, message: nudgeMessage(signal.kind) }
}

export function dismissLowConfidenceNudge(ledger: DocumentReadingLedger, nudgeId: string, now = Date.now()): DocumentReadingLedger {
  if (ledger.dismissedNudges.some((dismissal) => dismissal.id === nudgeId)) return ledger
  return { ...ledger, dismissedNudges: [...ledger.dismissedNudges, { id: nudgeId, dismissedAt: now }], updatedAt: now }
}

/**
 * Basic same-document change impact. Exact id/fingerprint continuity is safe; every
 * other prior decision is reported for review. It deliberately does not infer impact
 * across documents, determine truth, or use AI.
 */
export function assessReadingLedgerImpact(ledger: DocumentReadingLedger, currentAnchors: readonly BlockAnchor[]): ReadingLedgerImpactReport {
  const byId = new Map(currentAnchors.map((anchor) => [anchor.id, anchor]))
  const fingerprints = new Set(currentAnchors.map((anchor) => anchor.contentFingerprint))
  const impacts = ledger.entries.map((entry) => {
    const located = byId.get(entry.anchor.id)?.contentFingerprint === entry.anchor.contentFingerprint
      || fingerprints.has(entry.anchor.contentFingerprint)
    return {
      entryId: entry.id,
      anchor: entry.anchor,
      state: entry.state,
      status: located ? 'still-located' as const : 'changed-or-missing' as const,
      requiresReview: !located,
    }
  })
  return { documentKey: ledger.documentKey, impacts, changedCount: impacts.filter((impact) => impact.requiresReview).length }
}

export function entryIdFor(anchor: BlockAnchor): string { return `state:${anchor.id}` }

function clamp(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) }

function nudgeMessage(kind: ReadingBehaviorSignal['kind']): string {
  switch (kind) {
    case 'revisit': return '你似乎又回到这里；如有需要，可手动标记为“存疑”。'
    case 'long-pause': return '这里停留较久；如有需要，可手动留下问题。'
    case 'repeated-search': return '你多次检索了这一处；如有需要，可手动标记为“存疑”。'
    case 'backtrack': return '你回看了这一段；如有需要，可手动记录判断。'
  }
}
