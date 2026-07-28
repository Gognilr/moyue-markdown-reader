// 持久化服务 —— 封装 tauri-plugin-store 的同步逻辑
// 在非 Tauri 环境下回退到 localStorage，保证开发可运行

import { mergeHistoryItems, useHistoryStore } from '../store/useHistoryStore'
import type { HistoryItem } from '../store/useHistoryStore'
import { useThemeStore } from '../store/useThemeStore'
import { useLayoutStore } from '../store/useLayoutStore'
import { isTauri } from './fileService'
import type { PersistData, AppTheme, RecoveryDraft, LayoutPreferences } from '../types'

/** Store 文件名 */
const STORE_FILE = 'settings.json'
/** localStorage 兜底 key */
const LS_KEY = 'md_reader_data'
const STORE_WRITE_TIMEOUT_MS = 1_500

async function settleStoreWrite(operation: Promise<unknown>, label: string): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out`)), STORE_WRITE_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

/** 浏览器兜底：从 localStorage 读取 */
function loadFromLocalStorage(): Partial<PersistData> | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<PersistData>
  } catch {
    return null
  }
}

/** 浏览器兜底：写入 localStorage */
function saveToLocalStorage(data: Partial<PersistData>): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('localStorage 写入失败:', e)
  }
}

export const persistService = {
  /**
   * 启动时加载本地持久化数据（历史记录 + 主题）
   */
  async loadStore(): Promise<RecoveryDraft | null> {
    try {
      let data: Partial<PersistData> | null = null
      let returnDraft: RecoveryDraft | null = null

      if (isTauri()) {
        const { LazyStore } = await import('@tauri-apps/plugin-store')
        const store = new LazyStore(STORE_FILE)
        const history = await store.get<HistoryItem[] | null>('history')
        const theme = await store.get<AppTheme | null>('theme')
        const layout = await store.get<LayoutPreferences | null>('layout')
        data = { history: history || [], theme: theme || 'paper', layout: layout || undefined }
        const draft = await store.get<RecoveryDraft | null>('recoveryDraft')
        if (draft?.content) returnDraft = draft
      } else {
        data = loadFromLocalStorage()
        returnDraft = data?.recoveryDraft ?? null
      }

      if (data) {
        if (data.history) {
          // Do not replace a document opened during asynchronous startup
          // hydration (for example through a .md file association).
          const runtimeHistory = useHistoryStore.getState().history
          useHistoryStore.getState().setHistory(mergeHistoryItems(data.history, runtimeHistory))
        }
        if (data.theme) {
          useThemeStore.getState().setTheme(data.theme)
        }
        if (data.layout) useLayoutStore.getState().setLayout(data.layout)
      }
      return returnDraft
    } catch (e) {
      console.error('加载持久化数据失败:', e)
      return null
    }
  },

  /**
   * 将当前历史记录与主题写入本地存储
   */
  async saveStore(): Promise<void> {
    try {
      const data: Partial<PersistData> = {
        history: useHistoryStore.getState().history,
        theme: useThemeStore.getState().theme,
        layout: useLayoutStore.getState(),
      }

      if (isTauri()) {
        const { LazyStore } = await import('@tauri-apps/plugin-store')
        const store = new LazyStore(STORE_FILE)
        await store.set('history', data.history)
        await store.set('theme', data.theme)
        await store.set('layout', data.layout)
        await store.save()
      } else {
        // Match the Tauri store's per-key updates: preferences/history must not
        // erase a recovery draft while its prompt is waiting for a decision.
        saveToLocalStorage({ ...(loadFromLocalStorage() || {}), ...data })
      }
    } catch (e) {
      console.error('保存持久化数据失败:', e)
    }
  },

  async saveRecoveryDraft(draft: RecoveryDraft): Promise<void> {
    if (isTauri()) {
      const { LazyStore } = await import('@tauri-apps/plugin-store')
      const store = new LazyStore(STORE_FILE)
      await store.set('recoveryDraft', draft)
      await store.save()
      return
    }
    const data = loadFromLocalStorage() || {}
    saveToLocalStorage({ ...data, recoveryDraft: draft })
  },

  async clearRecoveryDraft(): Promise<void> {
    try {
      if (isTauri()) {
        const { LazyStore } = await import('@tauri-apps/plugin-store')
        const store = new LazyStore(STORE_FILE)
        // Writing a tombstone is more robust than awaiting delete on older
        // plugin-store data files. loadStore already treats null as no draft.
        await settleStoreWrite((async () => {
          await store.set('recoveryDraft', null)
          await store.save()
        })(), 'clear recovery draft')
        return
      }
      const data = loadFromLocalStorage() || {}
      delete data.recoveryDraft
      saveToLocalStorage(data)
    } catch (error) {
      // Clearing recovery metadata must never freeze Save/Discard/Close UI.
      // A failed write is logged and can be retried by the next clean-state pass.
      console.error('清理恢复草稿失败:', error)
    }
  },
}
