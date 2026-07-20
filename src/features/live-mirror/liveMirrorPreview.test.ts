import { describe, expect, it } from 'vitest'
import { MAX_LIVE_MIRROR_SNAPSHOT_BYTES, validateLiveMirrorPreviewSnapshot } from './liveMirrorPreview'

describe('Live Mirror temporary-window payload contract', () => {
  it('requires a title and bounds the in-memory document snapshot', () => {
    expect(validateLiveMirrorPreviewSnapshot({ title: '', markdown: '# A', overlays: [] })).toContain('title')
    expect(validateLiveMirrorPreviewSnapshot({ title: 'A', markdown: 'x'.repeat(MAX_LIVE_MIRROR_SNAPSHOT_BYTES + 1), overlays: [] })).toContain('4 MiB')
  })

  it('accepts a compact read-only snapshot', () => {
    expect(validateLiveMirrorPreviewSnapshot({ title: 'A.md', markdown: '# A', overlays: [{ id: 'x', kind: 'warning', line: 1, label: 'Check' }] })).toBeNull()
  })
})
