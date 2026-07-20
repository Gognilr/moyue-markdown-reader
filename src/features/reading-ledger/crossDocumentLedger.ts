import type { ReadingTaskDocument } from '../../types'
import type { DocumentReadingLedger, ReadingLedgerEntry, ReadingWorkflowState } from './readingLedger'

export interface LedgerDocumentScope {
  key: string
  title: string
  path: string | null
}

export interface CrossDocumentLedgerEntry {
  document: LedgerDocumentScope
  entry: ReadingLedgerEntry
}

export interface CrossDocumentLedgerSummary {
  documents: LedgerDocumentScope[]
  entries: CrossDocumentLedgerEntry[]
  byWorkflow: Record<ReadingWorkflowState, CrossDocumentLedgerEntry[]>
  /** Missing local ledgers make this overview only a low-confidence aid. */
  missingDocumentKeys: string[]
  confidence: number
  lowConfidenceMessage: string | null
}

/**
 * Builds a local-only view over documents intentionally selected by a reading
 * task or the currently open tabs.  It does not scan folders, use a network, or
 * manufacture any understanding / workflow state.
 */
export function summarizeCrossDocumentLedger(
  documents: readonly LedgerDocumentScope[],
  ledgers: readonly DocumentReadingLedger[],
): CrossDocumentLedgerSummary {
  const uniqueDocuments = dedupeDocuments(documents)
  const byKey = new Map(ledgers.map((ledger) => [ledger.documentKey, ledger]))
  const entries: CrossDocumentLedgerEntry[] = []
  const missingDocumentKeys: string[] = []
  for (const document of uniqueDocuments) {
    const ledger = byKey.get(document.key)
    if (!ledger) {
      missingDocumentKeys.push(document.key)
      continue
    }
    for (const entry of ledger.entries) entries.push({ document, entry })
  }
  const byWorkflow: CrossDocumentLedgerSummary['byWorkflow'] = {
    'pending-verification': entries.filter(({ entry }) => entry.workflowState === 'pending-verification'),
    'judgement-formed': entries.filter(({ entry }) => entry.workflowState === 'judgement-formed'),
  }
  const confidence = uniqueDocuments.length === 0 ? 0 : Math.max(0, Math.min(1, (uniqueDocuments.length - missingDocumentKeys.length) / uniqueDocuments.length))
  const lowConfidenceMessage = missingDocumentKeys.length > 0
    ? `本地账本仅覆盖 ${uniqueDocuments.length - missingDocumentKeys.length}/${uniqueDocuments.length} 篇已选文档；这不是理解或判断结论。`
    : null
  return { documents: uniqueDocuments, entries, byWorkflow, missingDocumentKeys, confidence, lowConfidenceMessage }
}

export function scopeFromTaskDocuments(documents: readonly ReadingTaskDocument[]): LedgerDocumentScope[] {
  return documents.map((document) => ({ key: document.path ?? document.key, title: document.title, path: document.path }))
}

function dedupeDocuments(documents: readonly LedgerDocumentScope[]): LedgerDocumentScope[] {
  const seen = new Set<string>()
  return documents.filter((document) => document.key && !seen.has(document.key) && (seen.add(document.key), true))
}
