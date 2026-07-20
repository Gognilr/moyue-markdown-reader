// 主题状态管理 Store
// 管理浅色/深色/纸色三套主题切换

import { create } from 'zustand'
import type { AppTheme } from '../types'

// 向后兼容：重导出 Theme 类型
export type Theme = AppTheme

interface ThemeState {
  theme: AppTheme
  setTheme: (theme: AppTheme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'paper', // 默认推荐浅色/护眼纸张主题
  setTheme: (theme) => set({ theme }),
}))
