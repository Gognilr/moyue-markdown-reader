import { describe, expect, it } from 'vitest'
import { createContentFingerprint, rankRelocationCandidates, recommendRelocation } from './fileRelocation'

describe('file relocation matcher', () => {
  it('prefers an exact content match even after a rename', () => {
    const identity = { path: 'C:\\notes\\plan.md', fingerprint: createContentFingerprint('# Plan\nkeep this context') }
    const ranked = rankRelocationCandidates(identity, [
      { path: 'C:\\notes\\plan.md', fingerprint: createContentFingerprint('different') },
      { path: 'C:\\notes\\archived-plan.md', fingerprint: createContentFingerprint('# Plan\r\nkeep this context') },
    ])
    expect(ranked.map((item) => item.candidate.path)).toEqual(['C:\\notes\\archived-plan.md', 'C:\\notes\\plan.md'])
    expect(ranked[0]).toMatchObject({ confidence: 'high', reasons: ['content-fingerprint', 'same-directory'] })
  })

  it('keeps same-name candidates as suggestions rather than auto-reopening them', () => {
    const identity = { path: '/notes/plan.md', fingerprint: createContentFingerprint('original') }
    const candidates = [{ path: '/notes/plan.md', fingerprint: createContentFingerprint('new unrelated file') }]
    expect(rankRelocationCandidates(identity, candidates)[0].confidence).toBe('medium')
    expect(recommendRelocation(identity, candidates)).toBeNull()
  })

  it('refuses ambiguous high-confidence matches', () => {
    const fingerprint = createContentFingerprint('same document')
    const identity = { path: '/notes/old.md', fingerprint }
    expect(recommendRelocation(identity, [
      { path: '/notes/a.md', fingerprint },
      { path: '/notes/b.md', fingerprint },
    ])).toBeNull()
  })
})
