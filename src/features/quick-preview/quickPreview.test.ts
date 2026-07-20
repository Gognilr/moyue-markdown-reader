import { describe, expect, it } from 'vitest'
import { quickPreviewActionFromKey } from './quickPreview'

describe('quick preview keyboard contract', () => {
  it('maps unmodified Escape and Enter to the native lifecycle actions', () => {
    expect(quickPreviewActionFromKey({ key: 'Escape' })).toBe('close')
    expect(quickPreviewActionFromKey({ key: 'Enter' })).toBe('promote')
  })

  it('does not steal modified keys or Enter from editable controls', () => {
    expect(quickPreviewActionFromKey({ key: 'Escape', ctrlKey: true })).toBeNull()
    expect(quickPreviewActionFromKey({ key: 'Enter', target: { tagName: 'INPUT' } as unknown as EventTarget })).toBeNull()
  })
})
