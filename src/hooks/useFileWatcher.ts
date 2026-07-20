import { useEffect } from 'react'
import { fileService } from '../services/fileService'
import { useFileStore } from '../store/useFileStore'
import { useDocumentTabsStore } from '../store/useDocumentTabsStore'
import { isOpenPackagePath } from '../features/format-package/importOpenZipPackage'

/** 外部工具保存当前文件时刷新阅读内容；本地未保存修改始终优先保留。 */
export function useFileWatcher() {
  const currentPath = useFileStore((state) => state.currentPath)

  useEffect(() => {
    if (!currentPath || isOpenPackagePath(currentPath)) return
    let disposed = false
    let unwatch: (() => void) | null = null

    void fileService.watchTextFile(currentPath, async () => {
      if (disposed) return
      const state = useFileStore.getState()
      if (state.currentPath !== currentPath) return
      if (state.isModified) {
        state.setExternalChange(true)
        return
      }
      try {
        window.dispatchEvent(new CustomEvent('md-reader:before-external-refresh'))
        const content = await fileService.readTextFile(currentPath)
        if (disposed || useFileStore.getState().currentPath !== currentPath) return
        const tab = useDocumentTabsStore.getState().tabs.find((candidate) => candidate.path === currentPath)
        if (tab) useDocumentTabsStore.getState().reloadDocument(tab.id, content)
        useFileStore.getState().restoreDocument({ path: currentPath, content })
      } catch (error) {
        console.error('刷新外部文件变更失败:', error)
      }
    }).then((stop) => { unwatch = stop }).catch((error) => console.error('文件监听启动失败:', error))

    return () => {
      disposed = true
      unwatch?.()
    }
  }, [currentPath])
}
