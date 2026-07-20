import { beforeEach, describe, expect, it } from 'vitest'
import { useFileStore } from './useFileStore'

describe('useFileStore restoreDocument', () => {
  beforeEach(() => useFileStore.setState({
    currentPath: 'old.md',
    content: 'edited',
    lastSavedContent: 'saved',
    isModified: true,
    hasExternalChange: true,
    mode: 'edit',
  }))

  it('replaces a document without creating a transient dirty snapshot', () => {
    useFileStore.getState().restoreDocument({ path: 'new.md', content: '# New' })
    expect(useFileStore.getState()).toMatchObject({
      currentPath: 'new.md',
      content: '# New',
      lastSavedContent: '# New',
      isModified: false,
      hasExternalChange: false,
      mode: 'read',
    })
  })
})
