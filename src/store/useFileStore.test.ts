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

  it('replaces a document without creating a transient dirty snapshot and preserves the current mode', () => {
    useFileStore.getState().restoreDocument({ path: 'new.md', content: '# New' })
    expect(useFileStore.getState()).toMatchObject({
      currentPath: 'new.md',
      content: '# New',
      lastSavedContent: '# New',
      isModified: false,
      hasExternalChange: false,
      mode: 'edit',
    })
  })

  it('allows an intentional open to select read mode explicitly', () => {
    useFileStore.getState().restoreDocument({ path: 'new.md', content: '# New', mode: 'read' })
    expect(useFileStore.getState().mode).toBe('read')
  })

  it('keeps every local content mutation in edit mode', () => {
    useFileStore.setState({ mode: 'read', isModified: false, content: 'before' })

    useFileStore.getState().setContent('after delete')

    expect(useFileStore.getState()).toMatchObject({
      content: 'after delete',
      isModified: true,
      mode: 'edit',
    })
  })

  it('ignores a stale same-document read checkpoint while a draft is dirty', () => {
    useFileStore.setState({
      currentPath: 'same.md',
      content: 'draft after delete',
      isModified: true,
      mode: 'edit',
    })

    useFileStore.getState().restoreDocument({
      path: 'same.md',
      content: 'disk snapshot',
      isModified: false,
      mode: 'read',
    })

    expect(useFileStore.getState().mode).toBe('edit')
  })
})
