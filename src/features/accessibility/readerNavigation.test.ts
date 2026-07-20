import { describe, expect, it } from 'vitest'
import {
  READER_SHORTCUTS,
  readerAriaId,
  readerLandmarkAria,
  searchStatusMessage,
  shortcutForEvent,
} from './readerNavigation'

describe('reader keyboard map', () => {
  it('recognises Ctrl and Cmd variants without conflating modifier combinations', () => {
    expect(shortcutForEvent({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })?.id).toBe('find')
    expect(shortcutForEvent({ key: 'F', ctrlKey: false, metaKey: true, shiftKey: false, altKey: false })?.id).toBe('find')
    expect(shortcutForEvent({ key: 'f', ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBeUndefined()
    expect(READER_SHORTCUTS.map((shortcut) => shortcut.id)).toContain('closeOverlay')
  })

  it('keeps document labels and live search messages deterministic', () => {
    expect(readerLandmarkAria('Architecture notes')).toEqual({ role: 'document', 'aria-label': 'Architecture notes', tabIndex: -1 })
    expect(searchStatusMessage(9, 3)).toBe('Search result 3 of 3.')
    expect(searchStatusMessage(0, 0)).toBe('No search results.')
    expect(readerAriaId('reader-status', 'chapter 1')).toBe('reader-status-chapter-1')
  })
})
