// 历史记录与收藏状态管理
// 最多保存 50 条，按 lastOpenedAt 淘汰，收藏不淘汰

import { create } from 'zustand'
import type { HistoryItem } from '../types'

export type { HistoryItem }

let lastOpenedTimestamp = 0

function nextOpenedTimestamp(): number {
  // 同一毫秒连续打开多个文件时仍保持确定的“最近”排序。
  lastOpenedTimestamp = Math.max(Date.now(), lastOpenedTimestamp + 1)
  return lastOpenedTimestamp
}

/**
 * Combines persisted history with entries created while persistence is still
 * loading. A .md file association can open a document before Tauri Store
 * finishes reading; replacing state at that point loses the new recent item.
 */
export function mergeHistoryItems(
  persisted: readonly HistoryItem[],
  runtime: readonly HistoryItem[],
): HistoryItem[] {
  const byPath = new Map<string, HistoryItem>()
  for (const item of persisted) {
    if (item?.path) byPath.set(item.path, item)
  }
  for (const item of runtime) {
    if (item?.path) byPath.set(item.path, { ...byPath.get(item.path), ...item })
  }

  const ordered = [...byPath.values()].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
  const favorites = ordered.filter((item) => item.isFavorite)
  const recent = ordered.filter((item) => !item.isFavorite).slice(0, 50)
  const history = [...favorites, ...recent].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
  lastOpenedTimestamp = Math.max(lastOpenedTimestamp, ...history.map((item) => item.lastOpenedAt || 0))
  return history
}

interface HistoryState {
  history: HistoryItem[]
  setHistory: (history: HistoryItem[]) => void
  /** 新增或更新条目（会刷新 lastOpenedAt） */
  addOrUpdateItem: (path: string, updates?: Partial<HistoryItem>) => void
  /** 仅更新滚动位置（不刷新 lastOpenedAt，避免列表频繁重排） */
  updateScrollPosition: (path: string, ratio: number) => void
  /** Rebind a history item after a confirmed local move without losing its reading state. */
  relocateItem: (fromPath: string, toPath: string, updates?: Partial<HistoryItem>) => void
  toggleFavorite: (path: string) => void
  removeItem: (path: string) => void
}

export const useHistoryStore = create<HistoryState>((set) => ({
  history: [],
  setHistory: (history) => set({ history: mergeHistoryItems(history, []) }),

  addOrUpdateItem: (path, updates = {}) => set((state) => {
    const existingIndex = state.history.findIndex(item => item.path === path)
    let newHistory = [...state.history]

    const fileName = path.split(/[/\\]/).pop() || ''
    const title = fileName.replace(/\.(md|markdown)$/i, '') || '未命名'

    if (existingIndex > -1) {
      newHistory[existingIndex] = {
        ...newHistory[existingIndex],
        ...updates,
        lastOpenedAt: nextOpenedTimestamp(),
      }
    } else {
      newHistory.push({
        path,
        title,
        lastOpenedAt: nextOpenedTimestamp(),
        isFavorite: false,
        scrollPositionRatio: 0,
        ...updates,
      })
    }

    // 淘汰机制：最近时间戳淘汰，最多保存 50 条非收藏的旧记录
    newHistory.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    const favorites = newHistory.filter(h => h.isFavorite)
    const nonFavorites = newHistory.filter(h => !h.isFavorite)
    // 收藏永不因历史上限被淘汰；最多保留最近 50 条非收藏记录。
    newHistory = [...favorites, ...nonFavorites.slice(0, 50)]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)

    return { history: newHistory }
  }),

  updateScrollPosition: (path, ratio) => set((state) => ({
    history: state.history.map(item =>
      item.path === path ? { ...item, scrollPositionRatio: ratio } : item
    ),
  })),

  relocateItem: (fromPath, toPath, updates = {}) => set((state) => {
    if (fromPath === toPath) return state
    const source = state.history.find((item) => item.path === fromPath)
    const destination = state.history.find((item) => item.path === toPath)
    if (!source && !destination) return state

    const title = toPath.split(/[/\\]/).pop()?.replace(/\.(md|markdown)$/i, '') || '未命名'
    const previousPaths = [...new Set([
      ...(destination?.previousPaths ?? []),
      ...(source?.previousPaths ?? []),
      fromPath,
    ].filter((path) => path !== toPath))].slice(-8)
    const rebound: HistoryItem = {
      ...(source ?? destination!),
      ...(destination ?? {}),
      ...updates,
      path: toPath,
      title,
      // A move should remain visible as a recent action but does not invent
      // content identity: callers can attach a freshly read fingerprint.
      lastOpenedAt: nextOpenedTimestamp(),
      isFavorite: Boolean(source?.isFavorite || destination?.isFavorite),
      scrollPositionRatio: source?.scrollPositionRatio ?? destination?.scrollPositionRatio ?? 0,
      previousPaths,
    }
    return { history: [rebound, ...state.history.filter((item) => item.path !== fromPath && item.path !== toPath)] }
  }),

  toggleFavorite: (path) => set((state) => ({
    history: state.history.map(item =>
      item.path === path ? { ...item, isFavorite: !item.isFavorite } : item
    ),
  })),

  removeItem: (path) => set((state) => ({
    history: state.history.filter(item => item.path !== path),
  })),
}))
