import { describe, expect, it } from 'vitest'
import type { BlockAnchor } from '../../types'
import { assessReadingLedgerImpact, createEmptyReadingLedger, dismissLowConfidenceNudge, readingStatesByAnchor, recordReadingState, setReadingWorkflowState, suggestLowConfidenceNudge } from './readingLedger'
import { createLocalStorageReadingLedgerRepository, parseReadingLedger } from './readingLedgerRepository'
import { summarizeCrossDocumentLedger } from './crossDocumentLedger'

const anchor: BlockAnchor = { id: 'block-a', contentFingerprint: 'same-content', headingPath: ['部署'], blockType: 'paragraph' }

describe('reading understanding ledger', () => {
  it('only records an explicit reader decision and replaces the state for one source', () => {
    const initial = createEmptyReadingLedger('C:/notes/deploy.md', 1)
    const questioned = recordReadingState(initial, { anchor, state: 'questioned', purpose: 'execution-decision', note: '需要确认回滚' }, 2)
    const understood = recordReadingState(questioned, { anchor, state: 'understood' }, 3)
    expect(understood.entries).toEqual([expect.objectContaining({ state: 'understood', purpose: 'execution-decision', note: undefined, createdAt: 2, updatedAt: 3 })])
  })

  it('offers only dismissible low-confidence hints without changing a state', () => {
    const ledger = createEmptyReadingLedger('doc', 1)
    const nudge = suggestLowConfidenceNudge(ledger, { kind: 'revisit', anchor, confidence: 0.42 })
    expect(nudge).toMatchObject({ dismissible: true, kind: 'revisit' })
    expect(ledger.entries).toHaveLength(0)
    const dismissed = dismissLowConfidenceNudge(ledger, nudge!.id, 2)
    expect(suggestLowConfidenceNudge(dismissed, { kind: 'revisit', anchor, confidence: 0.42 })).toBeNull()
    expect(suggestLowConfidenceNudge(ledger, { kind: 'backtrack', anchor, confidence: 0.9 })).toBeNull()
  })

  it('reports only same-document anchors changed or missing for reader review', () => {
    const ledger = recordReadingState(createEmptyReadingLedger('doc', 1), { anchor, state: 'disagreed' }, 2)
    expect(assessReadingLedgerImpact(ledger, [{ ...anchor, id: 'renamed-block' }])).toMatchObject({ changedCount: 0 })
    expect(assessReadingLedgerImpact(ledger, [])).toMatchObject({ changedCount: 1, impacts: [expect.objectContaining({ requiresReview: true })] })
  })

  it('migrates v1 data and persists a versioned local single-document payload', () => {
    const migrated = parseReadingLedger(JSON.stringify({ version: 1, documentKey: 'doc', states: [{ anchor, state: 'skipped' }] }))
    expect(migrated).toMatchObject({ schema: 'md-reader.reading-ledger', version: 2, entries: [expect.objectContaining({ state: 'skipped' })] })
    const storage = new Map<string, string>()
    const repository = createLocalStorageReadingLedgerRepository({
      getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => void storage.set(key, value), removeItem: (key) => void storage.delete(key),
      clear: () => storage.clear(), key: () => null, get length() { return storage.size },
    } as Storage)
    repository.save(migrated)
    expect(repository.load('doc').entries).toHaveLength(1)
  })

  it('keeps the four explicit understanding states intact when a reader adds follow-up workflow state', () => {
    const initial = recordReadingState(createEmptyReadingLedger('doc-a', 1), { anchor, state: 'disagreed', note: '需要证据' }, 2)
    const pending = setReadingWorkflowState(initial, initial.entries[0].id, 'pending-verification', 3)
    const formed = setReadingWorkflowState(pending, pending.entries[0].id, 'judgement-formed', 4)
    expect(formed.entries[0]).toMatchObject({ state: 'disagreed', note: '需要证据', workflowState: 'judgement-formed', createdAt: 2, updatedAt: 4 })
  })

  it('exposes explicit source states for the cognitive route without deriving progress', () => {
    const ledger = recordReadingState(createEmptyReadingLedger('doc-a', 1), { anchor, state: 'questioned' }, 2)
    expect(readingStatesByAnchor(ledger)).toEqual({ 'block-a': 'questioned' })
    expect(readingStatesByAnchor(null)).toEqual({})
  })

  it('aggregates only explicitly scoped local documents and flags incomplete coverage as low confidence', () => {
    const docA = setReadingWorkflowState(
      recordReadingState(createEmptyReadingLedger('doc-a', 1), { anchor, state: 'questioned' }, 2),
      'state:block-a', 'pending-verification', 3,
    )
    const summary = summarizeCrossDocumentLedger([
      { key: 'doc-a', title: '甲', path: 'doc-a' },
      { key: 'doc-b', title: '乙', path: 'doc-b' },
      { key: 'doc-a', title: '重复甲', path: 'doc-a' },
    ], [docA])
    expect(summary.documents).toHaveLength(2)
    expect(summary.byWorkflow['pending-verification']).toHaveLength(1)
    expect(summary.byWorkflow['pending-verification'][0].entry.state).toBe('questioned')
    expect(summary).toMatchObject({ missingDocumentKeys: ['doc-b'], confidence: 0.5 })
    expect(summary.lowConfidenceMessage).toContain('1/2')
  })
})
