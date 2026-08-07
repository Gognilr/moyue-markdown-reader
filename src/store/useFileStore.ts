import { create } from 'zustand'

interface FileState {
  currentPath: string | null
  content: string
  /** Last successfully opened or saved bytes, kept in memory for local review. */
  lastSavedContent: string | null
  isModified: boolean
  hasExternalChange: boolean
  mode: 'read' | 'edit'
  setCurrentPath: (path: string | null) => void
  setContent: (content: string) => void
  /** Replaces visible content from disk or an already-open tab without marking it edited. */
  replaceContent: (content: string) => void
  setLastSavedContent: (content: string | null) => void
  setModified: (modified: boolean) => void
  setExternalChange: (hasExternalChange: boolean) => void
  setMode: (mode: 'read' | 'edit') => void
  /** Atomically restores one document snapshot without transient dirty states. */
  restoreDocument: (snapshot: {
    path: string | null
    content: string
    savedContent?: string | null
    isModified?: boolean
    mode?: 'read' | 'edit'
  }) => void
}

export const useFileStore = create<FileState>((set) => ({
  currentPath: null,
  content: '',
  lastSavedContent: null,
  isModified: false,
  hasExternalChange: false,
  mode: 'read', // 默认阅读模式
  setCurrentPath: (path) => set({ currentPath: path }),
  // Any content mutation originates from an editor action (typing, Enter,
  // Delete/Backspace, replace, or undo/redo). Mark it as editing atomically so
  // a concurrent refresh/checkpoint cannot render the read surface between the
  // keystroke and the dirty-state update.
  setContent: (content) => set({ content, isModified: true, mode: 'edit' }),
  replaceContent: (content) => set({ content }),
  setLastSavedContent: (lastSavedContent) => set({ lastSavedContent }),
  setModified: (isModified) => set({ isModified }),
  setExternalChange: (hasExternalChange) => set({ hasExternalChange }),
  setMode: (mode) => set({ mode }),
  restoreDocument: ({ path, content, savedContent = content, isModified = false, mode }) => set((state) => ({
    currentPath: path,
    content,
    lastSavedContent: savedContent,
    isModified,
    hasExternalChange: false,
    // A refresh/save checkpoint should not silently change the user's mode.
    // Callers that intentionally open a new document pass mode explicitly.
    // A stale same-document read checkpoint must not interrupt an unsaved edit
    // (this is especially important for Delete/Backspace racing file events).
    mode: state.currentPath === path && state.mode === 'edit' && (state.isModified || isModified)
      ? state.mode
      : mode ?? state.mode,
  })),
}))
