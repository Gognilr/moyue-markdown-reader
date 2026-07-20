import { describe, expect, it } from 'vitest'
import { canReadDiskRevision, canUseLastSavedRevision, currentBlockForDiffEntry, diffEntrySearchText, makeDiskDiffSource, makeLastSavedDiffSource, makePickedFileDiffSource } from './diffSources'

describe('local render-diff sources', () => {
  it('only exposes the disk baseline in a desktop file-backed session', () => {
    expect(canReadDiskRevision('E:/docs/plan.md', true)).toBe(true)
    expect(canReadDiskRevision(null, true)).toBe(false)
    expect(canReadDiskRevision('plan.md', false)).toBe(false)
  })

  it('keeps selected revisions in memory and identifies their local origin', () => {
    expect(makeDiskDiffSource('E:/docs/plan.md', '# Disk', 'plan.md')).toEqual({ kind: 'disk', label: '磁盘版本：plan.md', markdown: '# Disk', path: 'E:/docs/plan.md' })
    expect(makePickedFileDiffSource('baseline.md', '# Picked', 'baseline.md').kind).toBe('picked-file')
  })

  it('uses the last successfully saved snapshot only when current content differs', () => {
    expect(canUseLastSavedRevision(null, '# Draft')).toBe(false)
    expect(canUseLastSavedRevision('# Draft', '# Draft')).toBe(false)
    expect(canUseLastSavedRevision('# Saved', '# Draft')).toBe(true)
    expect(makeLastSavedDiffSource('# Saved', 'plan.md')).toEqual({ kind: 'last-saved', label: '上次保存版本：plan.md', markdown: '# Saved' })
  })

  it('navigates only to a block that still exists in the live reader', () => {
    const live = { id: 'p:1', kind: 'paragraph' as const, line: 3, headingPath: [], text: 'Current   paragraph' }
    expect(currentBlockForDiffEntry({ id: 'x', kind: 'modified', left: { ...live, text: 'Old paragraph' }, right: live })).toBe(live)
    expect(diffEntrySearchText({ id: 'removed', kind: 'removed', left: live, right: null })).toBeNull()
    expect(diffEntrySearchText({ id: 'x', kind: 'modified', left: null, right: live })).toBe('Current paragraph')
  })
})
