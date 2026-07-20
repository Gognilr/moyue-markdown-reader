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
  setContent: (content) => set({ content, isModified: true }),
  replaceContent: (content) => set({ content }),
  setLastSavedContent: (lastSavedContent) => set({ lastSavedContent }),
  setModified: (isModified) => set({ isModified }),
  setExternalChange: (hasExternalChange) => set({ hasExternalChange }),
  setMode: (mode) => set({ mode }),
  restoreDocument: ({ path, content, savedContent = content, isModified = false, mode = 'read' }) => set({
    currentPath: path,
    content,
    lastSavedContent: savedContent,
    isModified,
    hasExternalChange: false,
    mode,
  }),
}))
