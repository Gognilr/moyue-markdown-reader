import {
  createEmptyReadingLedger,
  type DocumentReadingLedger,
  type ReadingLedgerEntry,
  type ReadingLedgerNudgeDismissal,
  type ReadingUnderstandingState,
  type ReadingWorkflowState,
} from './readingLedger'

const STORAGE_PREFIX = 'md-reader:reading-ledger:'

export interface ReadingLedgerRepository {
  load(documentKey: string): DocumentReadingLedger
  save(ledger: DocumentReadingLedger): void
  remove(documentKey: string): void
  export(documentKey: string): string | null
  import(serialized: string): DocumentReadingLedger
}

interface LegacyV1Ledger {
  version: 1
  documentKey: string
  states: Array<Omit<ReadingLedgerEntry, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<ReadingLedgerEntry, 'id' | 'createdAt' | 'updatedAt'>>>
  updatedAt?: number
}

export function parseReadingLedger(serialized: string, expectedDocumentKey?: string): DocumentReadingLedger {
  const parsed: unknown = JSON.parse(serialized)
  const ledger = isV2(parsed) ? parsed : isV1(parsed) ? migrateReadingLedgerV1(parsed) : null
  if (!ledger) throw new Error('阅读状态账本格式无效')
  if (expectedDocumentKey && ledger.documentKey !== expectedDocumentKey) throw new Error('阅读状态账本不属于当前文档')
  return ledger
}

/** Compatibility migration for an early local-only `states` payload. */
export function migrateReadingLedgerV1(legacy: LegacyV1Ledger, now = Date.now()): DocumentReadingLedger {
  const entries = legacy.states.filter(hasValidLegacyEntry).map((entry) => ({
    ...entry,
    id: entry.id || `state:${entry.anchor.id}`,
    createdAt: validTime(entry.createdAt, now),
    updatedAt: validTime(entry.updatedAt, now),
    note: entry.note?.trim() || undefined,
  }))
  return {
    schema: 'md-reader.reading-ledger', version: 2, documentKey: legacy.documentKey,
    entries, dismissedNudges: [], updatedAt: validTime(legacy.updatedAt, now),
  }
}

export function createLocalStorageReadingLedgerRepository(storage: Storage): ReadingLedgerRepository {
  const key = (documentKey: string) => `${STORAGE_PREFIX}${documentKey}`
  return {
    load(documentKey) {
      const raw = storage.getItem(key(documentKey))
      return raw ? parseReadingLedger(raw, documentKey) : createEmptyReadingLedger(documentKey)
    },
    save(ledger) { storage.setItem(key(ledger.documentKey), JSON.stringify(ledger)) },
    remove(documentKey) { storage.removeItem(key(documentKey)) },
    export(documentKey) { return storage.getItem(key(documentKey)) },
    import(serialized) { return parseReadingLedger(serialized) },
  }
}

export const localStorageReadingLedgerRepository: ReadingLedgerRepository | null =
  typeof localStorage === 'undefined' ? null : createLocalStorageReadingLedgerRepository(localStorage)

function isV2(value: unknown): value is DocumentReadingLedger {
  if (!isRecord(value) || value.schema !== 'md-reader.reading-ledger' || value.version !== 2 || typeof value.documentKey !== 'string') return false
  return Array.isArray(value.entries) && Array.isArray(value.dismissedNudges) && value.entries.every(hasValidEntry) && value.dismissedNudges.every(hasValidDismissal)
}
function isV1(value: unknown): value is LegacyV1Ledger {
  return isRecord(value) && value.version === 1 && typeof value.documentKey === 'string' && Array.isArray(value.states)
}
function hasValidLegacyEntry(value: unknown): value is LegacyV1Ledger['states'][number] {
  return isRecord(value) && hasAnchor(value.anchor) && isState(value.state)
}
function hasValidEntry(value: unknown): value is ReadingLedgerEntry {
  return isRecord(value) && typeof value.id === 'string' && hasAnchor(value.anchor) && isState(value.state) && isWorkflowState(value.workflowState) && typeof value.createdAt === 'number' && typeof value.updatedAt === 'number'
}
function hasValidDismissal(value: unknown): value is ReadingLedgerNudgeDismissal {
  return isRecord(value) && typeof value.id === 'string' && typeof value.dismissedAt === 'number'
}
function hasAnchor(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && typeof value.contentFingerprint === 'string' && Array.isArray(value.headingPath) && typeof value.blockType === 'string'
}
function isState(value: unknown): value is ReadingUnderstandingState { return value === 'understood' || value === 'questioned' || value === 'skipped' || value === 'disagreed' }
function isWorkflowState(value: unknown): value is ReadingWorkflowState | undefined { return value === undefined || value === 'pending-verification' || value === 'judgement-formed' }
function validTime(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
