import { create } from 'zustand'
import type { DocumentTab, TabCloseDisposition } from '../types'

const MAX_HISTORY_ENTRIES = 100

export interface OpenDocumentTabInput {
  /** Use a path for a file-backed document; untitled tabs need an explicit id. */
  id?: string
  path?: string | null
  title: string
  content: string
}

interface DocumentTabsState {
  tabs: DocumentTab[]
  activeTabId: string | null
  openDocument: (input: OpenDocumentTabInput) => string
  activateTab: (id: string) => void
  updateContent: (id: string, content: string) => void
  /** Replaces a document from disk and starts a new undo boundary. */
  reloadDocument: (id: string, content: string) => void
  /** Reopens crash-recovery content as explicitly unsaved. */
  restoreDraft: (id: string, content: string) => void
  markSaved: (id: string) => void
  bindSavedPath: (id: string, path: string) => void
  undo: (id?: string) => void
  redo: (id?: string) => void
  requestClose: (id: string) => TabCloseDisposition
  closeTab: (id: string) => boolean
  discardAndClose: (id: string) => boolean
  closeAllClean: () => void
}

function tabId(input: OpenDocumentTabInput): string {
  if (input.path) return input.path
  if (input.id) return input.id
  throw new Error('Untitled document tabs require an id')
}

function boundedPush(stack: string[], value: string): string[] {
  return [...stack, value].slice(-MAX_HISTORY_ENTRIES)
}

function activeAfterClose(tabs: DocumentTab[], activeId: string | null, removedIndex: number): string | null {
  if (tabs.length === 0) return null
  if (activeId !== null) return activeId
  return tabs[Math.min(removedIndex, tabs.length - 1)].id
}

export const useDocumentTabsStore = create<DocumentTabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openDocument: (input) => {
    const id = tabId(input)
    const existing = get().tabs.find((tab) => tab.id === id)
    if (existing) {
      set({ activeTabId: id })
      return id
    }

    const tab: DocumentTab = {
      id,
      path: input.path ?? null,
      title: input.title,
      content: input.content,
      savedContent: input.content,
      isDirty: false,
      undoStack: [],
      redoStack: [],
    }
    set((state) => ({ tabs: [...state.tabs, tab], activeTabId: id }))
    return id
  },

  activateTab: (id) => set((state) => (
    state.tabs.some((tab) => tab.id === id) ? { activeTabId: id } : state
  )),

  updateContent: (id, content) => set((state) => ({
    tabs: state.tabs.map((tab) => {
      if (tab.id !== id || tab.content === content) return tab
      return {
        ...tab,
        content,
        isDirty: content !== tab.savedContent,
        undoStack: boundedPush(tab.undoStack, tab.content),
        redoStack: [],
      }
    }),
  })),

  reloadDocument: (id, content) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.id === id
      ? { ...tab, content, savedContent: content, isDirty: false, undoStack: [], redoStack: [] }
      : tab),
  })),

  restoreDraft: (id, content) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.id === id
      ? {
          ...tab,
          content,
          // Recovery data does not carry a trustworthy disk checkpoint. Keep
          // a distinct baseline so the draft remains dirty until explicit Save.
          savedContent: content ? '' : '\u0000',
          isDirty: true,
          undoStack: [],
          redoStack: [],
        }
      : tab),
  })),

  markSaved: (id) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.id === id
      ? { ...tab, savedContent: tab.content, isDirty: false }
      : tab),
  })),

  bindSavedPath: (id, path) => set((state) => ({
    tabs: state.tabs.map((tab) => tab.id === id ? { ...tab, path, title: path.split(/[\\/]/).pop() || tab.title } : tab),
  })),

  undo: (requestedId) => set((state) => {
    const id = requestedId ?? state.activeTabId
    if (!id) return state
    return {
      tabs: state.tabs.map((tab) => {
        if (tab.id !== id || tab.undoStack.length === 0) return tab
        const previous = tab.undoStack[tab.undoStack.length - 1]
        return {
          ...tab,
          content: previous,
          isDirty: previous !== tab.savedContent,
          undoStack: tab.undoStack.slice(0, -1),
          redoStack: boundedPush(tab.redoStack, tab.content),
        }
      }),
    }
  }),

  redo: (requestedId) => set((state) => {
    const id = requestedId ?? state.activeTabId
    if (!id) return state
    return {
      tabs: state.tabs.map((tab) => {
        if (tab.id !== id || tab.redoStack.length === 0) return tab
        const next = tab.redoStack[tab.redoStack.length - 1]
        return {
          ...tab,
          content: next,
          isDirty: next !== tab.savedContent,
          undoStack: boundedPush(tab.undoStack, tab.content),
          redoStack: tab.redoStack.slice(0, -1),
        }
      }),
    }
  }),

  requestClose: (id) => {
    const tab = get().tabs.find((candidate) => candidate.id === id)
    if (!tab) return { kind: 'missing' }
    return tab.isDirty
      ? { kind: 'confirm-discard', tab: { id: tab.id, title: tab.title, path: tab.path } }
      : { kind: 'close' }
  },

  closeTab: (id) => {
    if (get().requestClose(id).kind !== 'close') return false
    set((state) => {
      const removedIndex = state.tabs.findIndex((tab) => tab.id === id)
      if (removedIndex < 0) return state
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      return { tabs, activeTabId: activeAfterClose(tabs, state.activeTabId === id ? null : state.activeTabId, removedIndex) }
    })
    return true
  },

  discardAndClose: (id) => {
    const exists = get().tabs.some((tab) => tab.id === id)
    if (!exists) return false
    set((state) => {
      const removedIndex = state.tabs.findIndex((tab) => tab.id === id)
      const tabs = state.tabs.filter((tab) => tab.id !== id)
      return { tabs, activeTabId: activeAfterClose(tabs, state.activeTabId === id ? null : state.activeTabId, removedIndex) }
    })
    return true
  },

  closeAllClean: () => set((state) => {
    const tabs = state.tabs.filter((tab) => tab.isDirty)
    const activeTabId = tabs.some((tab) => tab.id === state.activeTabId) ? state.activeTabId : (tabs[0]?.id ?? null)
    return { tabs, activeTabId }
  }),
}))
