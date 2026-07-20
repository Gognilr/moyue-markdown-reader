// 外链打开服务 —— 通过系统默认浏览器打开外部链接

import { isTauri } from './fileService'

export const shellService = {
  /**
   * 使用系统默认浏览器打开外部 URL
   * @param url 要打开的链接
   */
  async openExternal(url: string): Promise<void> {
    if (!isTauri()) {
      // 浏览器开发模式：直接用 window.open
      window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
    } catch (e) {
      console.error('打开外部链接失败:', e)
      // 兜底：尝试用 window.open
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  },
}
