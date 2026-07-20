import { describe, expect, it } from 'vitest'
import { createRecoveryCapsule, getRecoveryDocumentChangeImpact, loadRecoveryCapsule, resolveRecoveryPosition, saveRecoveryCapsule } from './recoveryCapsule'

const source = `# 开始

介绍内容

## 部署

- [ ] 检查备份
部署前先确认环境变量。

## 完成

验证结果。`

describe('recovery capsule', () => {
  it('records semantic context, time, pending work and local layout', () => {
    const capsule = createRecoveryCapsule({ documentKey: '/notes/runbook.md', markdown: source, scrollRatio: 0.65, durationMs: 92_000, collapsedSections: ['开始'], layout: { fontFamily: 'system-ui, sans-serif', fontSize: 18, lineHeight: 1.8, letterSpacing: 0, paragraphSpacing: 1, contentWidth: 720, isVerticalReading: false, isSidebarOpen: true, isTocOpen: false } })
    expect(capsule).toMatchObject({ version: 2, heading: '部署', pendingTaskCount: 1, durationMs: 92_000, collapsedSections: ['开始'], textFingerprint: expect.any(String), documentFingerprint: expect.any(String) })
  })

  it('prefers the rendered viewport anchor over a line-ratio guess', () => {
    const capsule = createRecoveryCapsule({
      documentKey: '/notes/runbook.md',
      markdown: source,
      scrollRatio: 0.05,
      durationMs: 65_000,
      anchorHeading: '完成',
      anchorText: '验证结果。',
    })
    expect(capsule).toMatchObject({ heading: '完成', nearbyText: '验证结果。', durationMs: 65_000 })
    expect(resolveRecoveryPosition(source, capsule)).toMatchObject({ confidence: 'exact' })
  })

  it('relocates by text context after surrounding content is inserted', () => {
    const capsule = createRecoveryCapsule({ documentKey: 'a', markdown: source, scrollRatio: 0.65, durationMs: 1 })
    const moved = `# 开始\n\n新增摘要\n\n${source}`
    expect(resolveRecoveryPosition(moved, capsule)).toMatchObject({ confidence: 'exact' })
  })

  it('falls back to a heading and persists only in the supplied local storage', () => {
    const capsule = createRecoveryCapsule({ documentKey: 'a', markdown: source, scrollRatio: 0.65, durationMs: 1 })
    const storage = new Map<string, string>()
    const fakeStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(), key: () => null, length: 0 } as unknown as Storage
    saveRecoveryCapsule(capsule, fakeStorage)
    expect(loadRecoveryCapsule('a', fakeStorage)?.heading).toBe('部署')
    expect(resolveRecoveryPosition('# 开始\n\n## 部署\n\n文字已改', capsule)).toMatchObject({ confidence: 'heading', index: 2 })
  })

  it('carries explicit reading purpose, last judgement and unresolved questions without inferring them', () => {
    const capsule = createRecoveryCapsule({ documentKey: 'a', markdown: source, scrollRatio: 0.5, durationMs: 1, readingPurpose: 'execution-decision', understandingEntries: [
      { state: 'understood', headingPath: ['开始'], updatedAt: 1 },
      { state: 'questioned', headingPath: ['部署'], note: '备份策略是否覆盖远端？', updatedAt: 2 },
      { state: 'skipped', headingPath: ['完成'], workflowState: 'pending-verification', updatedAt: 3 },
    ] })
    expect(capsule).toMatchObject({ readingPurpose: 'execution-decision', lastUnderstanding: { state: 'skipped', heading: '完成' }, unresolvedQuestions: ['完成（待验证）', '备份策略是否覆盖远端？'] })
  })

  it('discloses a changed document before recovery and migrates legacy local prompts safely', () => {
    const capsule = createRecoveryCapsule({ documentKey: 'a', markdown: source, scrollRatio: 0.5, durationMs: 1 })
    expect(getRecoveryDocumentChangeImpact(source, capsule)).toMatchObject({ changed: false })
    expect(getRecoveryDocumentChangeImpact(`${source}\n新增内容`, capsule)).toMatchObject({ changed: true })
    const storage = new Map<string, string>()
    storage.set('md-reader:recovery-capsule:old', JSON.stringify({ version: 1, documentKey: 'old', nearbyText: '旧内容', scrollRatio: 0 }))
    const fakeStorage = { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key), clear: () => storage.clear(), key: () => null, length: 0 } as unknown as Storage
    expect(loadRecoveryCapsule('old', fakeStorage)).toMatchObject({ version: 2, lastUnderstanding: null, unresolvedQuestions: [] })
  })
})
