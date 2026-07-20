// 滚动位置记忆 Hook
// 监听阅读区滚动事件，节流（500ms）记录滚动百分比到历史 store
// 使用百分比而非像素，避免窗口缩放后失效

import { useFileStore } from '../../store/useFileStore'
import { useHistoryStore } from '../../store/useHistoryStore'
import { useRef, useCallback } from 'react'

/** 节流间隔（毫秒） */
const THROTTLE_MS = 500

export function useScrollMemory() {
  const { currentPath } = useFileStore()
  const lastSaveTime = useRef(0)

  /**
   * 滚动事件处理器（节流写入）
   * 计算 scrollTop / (scrollHeight - clientHeight) 百分比
   */
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>, page?: { index: number; count: number }) => {
    if (!currentPath) return

    const now = Date.now()
    if (now - lastSaveTime.current < THROTTLE_MS) return
    lastSaveTime.current = now

    const target = e.currentTarget
    const maxScroll = target.scrollHeight - target.clientHeight
    // 内容不足以滚动时，比例为 0
    const localRatio = maxScroll > 0 ? target.scrollTop / maxScroll : 0
    const ratio = page && page.count > 0
      ? (page.index + localRatio) / page.count
      : localRatio

    if (!isNaN(ratio)) {
      const clamped = Math.max(0, Math.min(1, ratio))
      useHistoryStore.getState().updateScrollPosition(currentPath, clamped)
    }
  }, [currentPath])

  /**
   * 恢复滚动位置到指定百分比
   * @param element 滚动容器元素
   * @param ratio 滚动百分比 (0 ~ 1)
   */
  const restoreScrollPosition = useCallback((element: HTMLDivElement | null, ratio: number) => {
    if (!element || ratio < 0 || ratio > 1) return
    const maxScroll = element.scrollHeight - element.clientHeight
    element.scrollTop = maxScroll * ratio
  }, [])

  return { handleScroll, restoreScrollPosition }
}
