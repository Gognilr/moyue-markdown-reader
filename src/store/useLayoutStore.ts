import { create } from 'zustand'
import type { LayoutPreferences, ReadingLayoutPreset } from '../types'

export interface ReadingLayoutPresetValues {
  fontFamily: string
  fontSize: number
  lineHeight: number
  contentWidth: number
  letterSpacing: number
  paragraphSpacing: number
}

export const readingLayoutPresets: Record<ReadingLayoutPreset, ReadingLayoutPresetValues> = {
  comfortable: { fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif', fontSize: 16, lineHeight: 1.8, contentWidth: 800, letterSpacing: 0.015, paragraphSpacing: 1.2 },
  compact: { fontFamily: '"Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif', fontSize: 15, lineHeight: 1.58, contentWidth: 920, letterSpacing: 0, paragraphSpacing: 0.8 },
  spacious: { fontFamily: '"STSong", "Songti SC", SimSun, serif', fontSize: 17, lineHeight: 2, contentWidth: 720, letterSpacing: 0.025, paragraphSpacing: 1.55 },
}

interface LayoutState extends LayoutPreferences {
  setFontSize: (fontSize: number) => void
  setLineHeight: (lineHeight: number) => void
  setContentWidth: (contentWidth: number) => void
  setLetterSpacing: (letterSpacing: number) => void
  setParagraphSpacing: (paragraphSpacing: number) => void
  toggleVerticalReading: () => void
  applyReadingPreset: (preset: ReadingLayoutPreset) => void
  toggleSidebar: () => void
  toggleToc: () => void
  setLayout: (layout: Partial<LayoutPreferences>) => void
}

export const defaultLayout: LayoutPreferences = {
  ...readingLayoutPresets.comfortable,
  isVerticalReading: false,
  isSidebarOpen: true,
  isTocOpen: true,
}

export const useLayoutStore = create<LayoutState>((set) => ({
  ...defaultLayout,
  setFontSize: (fontSize) => set({ fontSize: Math.max(13, Math.min(24, fontSize)) }),
  setLineHeight: (lineHeight) => set({ lineHeight: Math.max(1.4, Math.min(2.4, lineHeight)) }),
  setContentWidth: (contentWidth) => set({ contentWidth: Math.max(560, Math.min(1100, contentWidth)) }),
  setLetterSpacing: (letterSpacing) => set({ letterSpacing: Math.max(-0.02, Math.min(0.08, letterSpacing)) }),
  setParagraphSpacing: (paragraphSpacing) => set({ paragraphSpacing: Math.max(0.4, Math.min(2.4, paragraphSpacing)) }),
  toggleVerticalReading: () => set((state) => ({ isVerticalReading: !state.isVerticalReading })),
  applyReadingPreset: (preset) => set(readingLayoutPresets[preset]),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleToc: () => set((state) => ({ isTocOpen: !state.isTocOpen })),
  setLayout: (layout) => set(layout),
}))
