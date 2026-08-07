import { Toolbar } from './components/Toolbar'
import { Sidebar } from './components/Sidebar'
import { MarkdownView } from './features/markdown/MarkdownView'
import { Editor } from './components/Editor'
import { Toc } from './components/Toc'
import { useFileStore } from './store/useFileStore'
import { useThemeStore } from './store/useThemeStore'
import { useHistoryStore } from './store/useHistoryStore'
import { useCallback, useEffect, useRef } from 'react'
import { useState } from 'react'
import { persistService } from './services/persistService'
import { fileService, isTauri } from './services/fileService'
import { openDocument, saveAllDirtyDocuments, saveCurrentDocument, saveDocumentTab } from './services/documentService'
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard'
import { useFileWatcher } from './hooks/useFileWatcher'
import { RecoveryDialog } from './components/RecoveryDialog'
import type { RecoveryDraft } from './types'
import { NOTICE_EVENT, type AppNotice } from './services/noticeService'
import { useLayoutStore } from './store/useLayoutStore'
import { CommandPalette } from './components/CommandPalette'
import { QuickPreviewRuntime } from './features/quick-preview/QuickPreviewRuntime'
import { LiveMirrorPreviewRuntime } from './features/live-mirror/LiveMirrorPreviewRuntime'
import { DocumentTabs } from './components/DocumentTabs'
import { useDocumentTabsStore } from './store/useDocumentTabsStore'
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog'
import { FirstLaunchCard } from './components/FirstLaunchCard'
import { dismissFirstLaunch, isMarkdownDrop, shouldShowFirstLaunch } from './features/onboarding/firstLaunch'
import type { ImportedOpenZipPackage } from './features/format-package/importOpenZipPackage'
import { activateDocumentSession } from './services/documentSession'
import { createContentFingerprint } from './features/relocation/fileRelocation'

function App() {
  const { mode, isModified, currentPath, content, restoreDocument, setMode } = useFileStore()
  const { theme } = useThemeStore()
  const { history } = useHistoryStore()
  const jumpListSignature = history.map((item) => `${item.path}\u0000${item.title}\u0000${item.lastOpenedAt}\u0000${item.isFavorite}`).join('\u0001')
  const [isTransientPreviewWindow, setIsTransientPreviewWindow] = useState(false)
  const [hasClassifiedWindow, setHasClassifiedWindow] = useState(() => !isTauri())
  const { isSidebarOpen, isTocOpen, fontFamily, fontSize, lineHeight, contentWidth, toggleSidebar, toggleToc } = useLayoutStore()
  const { runOrConfirm, dialog } = useUnsavedChangesGuard(saveCurrentDocument)

  useEffect(() => {
    if (!hasClassifiedWindow || isTransientPreviewWindow) return
    const timeout = window.setTimeout(() => {
      void import('./features/windows-shell/jumpList').then(({ syncWindowsJumpList }) => syncWindowsJumpList(history))
        .catch((error) => console.error('Unable to update Windows Jump List:', error))
    }, 400)
    return () => window.clearTimeout(timeout)
  }, [hasClassifiedWindow, isTransientPreviewWindow, jumpListSignature])
  const allowCloseRef = useRef(false)
  const nativeWindowRef = useRef<{ close: () => Promise<void>; destroy: () => Promise<void> } | null>(null)
  const [hasLoadedPersistence, setHasLoadedPersistence] = useState(false)
  const [recoveryDraft, setRecoveryDraft] = useState<RecoveryDraft | null>(null)
  const [notice, setNotice] = useState<AppNotice | null>(null)
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const { tabs, activeTabId, openDocument: openTab, activateTab, updateContent, markSaved, requestClose, closeTab, discardAndClose } = useDocumentTabsStore()
  const [tabCloseCandidate, setTabCloseCandidate] = useState<string | null>(null)
  const [isAppCloseRequested, setIsAppCloseRequested] = useState(false)
  const [isAppCloseSaving, setIsAppCloseSaving] = useState(false)
  const [showFirstLaunch, setShowFirstLaunch] = useState(() => shouldShowFirstLaunch())
  const [isBrowserDropActive, setIsBrowserDropActive] = useState(false)
  const packagePreviewRef = useRef<ImportedOpenZipPackage | null>(null)

  useFileWatcher()

  const activateDocumentTab = useCallback((id: string) => {
    activateDocumentSession(id)
    const tab = useDocumentTabsStore.getState().tabs.find((candidate) => candidate.id === id)
    if (tab?.path) useHistoryStore.getState().addOrUpdateItem(tab.path)
  }, [])

  const requestNativeClose = useCallback(async () => {
    allowCloseRef.current = true
    try {
      // This runs only after the user chose discard/save.  `destroy` avoids
      // re-entering the close-request listener that originally opened dialog.
      await nativeWindowRef.current?.destroy()
    } catch (error) {
      allowCloseRef.current = false
      setNotice({ message: `无法关闭窗口：${error instanceof Error ? error.message : '未知错误'}`, level: 'error' })
    }
  }, [])

  const saveAndCloseNativeWindow = useCallback(async () => {
    setIsAppCloseSaving(true)
    try {
      const saved = await saveAllDirtyDocuments()
      if (!saved) return
      // The native window may be destroyed before React can run the clean-state
      // effect. Clear the crash draft explicitly after every successful save.
      await persistService.clearRecoveryDraft()
      setIsAppCloseRequested(false)
      await requestNativeClose()
    } catch (error) {
      setNotice({ message: `保存失败，窗口未关闭：${error instanceof Error ? error.message : '未知错误'}`, level: 'error' })
    } finally {
      setIsAppCloseSaving(false)
    }
  }, [requestNativeClose])

  const openPath = useCallback((path: string) => {
    const existing = useDocumentTabsStore.getState().tabs.find((tab) => tab.path === path)
    if (existing) {
      useHistoryStore.getState().addOrUpdateItem(path)
      activateDocumentTab(existing.id)
      return
    }
    runOrConfirm(async () => {
      try {
        await openDocument(path)
        packagePreviewRef.current?.dispose()
        packagePreviewRef.current = null
      } catch (error) {
        console.error('打开拖入文件失败:', error)
      }
    })
  }, [activateDocumentTab, runOrConfirm])

  const requestCloseDocumentTab = useCallback((id: string) => {
    const disposition = requestClose(id)
    if (disposition.kind === 'close') {
      closeTab(id)
    } else if (disposition.kind === 'confirm-discard') {
      setTabCloseCandidate(id)
    }
  }, [closeTab, requestClose])

  // 初始化时加载本地存储
  useEffect(() => {
    void (async () => {
      const preview = isTauri() && await import('./features/quick-preview/quickPreview').then(({ isQuickPreviewWindow }) => isQuickPreviewWindow())
      setIsTransientPreviewWindow(preview)
      setHasClassifiedWindow(true)
      if (preview) return
      const draft = await persistService.loadStore()
      setRecoveryDraft(draft)
      setHasLoadedPersistence(true)
    })().catch((error) => console.error('Unable to classify window or load persistence:', error))
  }, [])

  // 文件关联启动：Tauri 将双击的 .md/.markdown 路径作为进程参数传入。
  useEffect(() => {
    if (!isTauri()) return
    void import('@tauri-apps/api/core').then(async ({ invoke }) => {
      const { isQuickPreviewWindow } = await import('./features/quick-preview/quickPreview')
      if (await isQuickPreviewWindow()) return
      const quickPreviewPath = await invoke<string | null>('startup_quick_preview_path')
      if (quickPreviewPath) {
        const [{ openQuickPreview }, { getCurrentWindow }] = await Promise.all([
          import('./features/quick-preview/quickPreview'),
          import('@tauri-apps/api/window'),
        ])
        await openQuickPreview(quickPreviewPath)
        await getCurrentWindow().hide()
        return
      }
      const path = await invoke<string | null>('startup_markdown_path')
      if (path) openPath(path)
    }).catch((error) => console.error('读取文件关联或快速预览启动参数失败:', error))
  }, [openPath])

  // 单实例模式：第二个进程双击文件时，Rust 端把路径经此事件转发到主窗口。
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void (async () => {
      const { isQuickPreviewWindow } = await import('./features/quick-preview/quickPreview')
      if (await isQuickPreviewWindow()) return
      const { listen } = await import('@tauri-apps/api/event')
      if (cancelled) return
      unlisten = await listen<string>('md-reader:open-external-file', (event) => {
        if (typeof event.payload === 'string' && event.payload) {
          window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: event.payload }))
        }
      })
    })().catch((error) => console.error('监听外部文件打开事件失败:', error))
    return () => { cancelled = true; unlisten?.() }
  }, [])

  // Open packages are virtual, read-only sessions.  Their resource object URLs
  // are retired when another package/document replaces the session or App exits.
  useEffect(() => () => packagePreviewRef.current?.dispose(), [])

  useEffect(() => {
    const handleOpenPackage = (event: Event) => {
      const imported = (event as CustomEvent<ImportedOpenZipPackage>).detail
      if (!imported?.path || !imported?.markdown) return
      runOrConfirm(() => {
        packagePreviewRef.current?.dispose()
        packagePreviewRef.current = imported
        const existing = useDocumentTabsStore.getState().tabs.find((tab) => tab.path === imported.path)
        if (existing) {
          useDocumentTabsStore.getState().reloadDocument(existing.id, imported.markdown)
          activateTab(existing.id)
        } else {
          openTab({ path: imported.path, title: imported.name, content: imported.markdown })
        }
        restoreDocument({ path: imported.path, content: imported.markdown, mode: 'read' })
        setNotice({ message: `已以只读方式打开随身包：${imported.name}`, level: 'info' })
      })
    }
    window.addEventListener('md-reader:open-package', handleOpenPackage)
    return () => window.removeEventListener('md-reader:open-package', handleOpenPackage)
  }, [activateTab, openTab, restoreDocument, runOrConfirm])

  useEffect(() => {
    const handleReloadPath = (event: Event) => {
      const path = (event as CustomEvent<string>).detail
      const tab = useDocumentTabsStore.getState().tabs.find((candidate) => candidate.path === path)
      if (!path || !tab) return
      runOrConfirm(async () => {
        try {
          const diskContent = await fileService.readTextFile(path)
          useDocumentTabsStore.getState().reloadDocument(tab.id, diskContent)
          if (useDocumentTabsStore.getState().activeTabId !== tab.id) activateDocumentTab(tab.id)
          useFileStore.getState().setExternalChange(false)
        } catch (error) {
          console.error('重新读取磁盘文档失败:', error)
          setNotice({ message: '无法重新读取磁盘文档。', level: 'error' })
        }
      })
    }
    window.addEventListener('md-reader:reload-path', handleReloadPath)
    return () => window.removeEventListener('md-reader:reload-path', handleReloadPath)
  }, [activateDocumentTab, runOrConfirm])

  useEffect(() => {
    const handleRefreshPath = (event: Event) => {
      const path = (event as CustomEvent<string>).detail
      if (!path) return
      const tab = useDocumentTabsStore.getState().tabs.find((candidate) => candidate.path === path)
      if (tab?.isDirty && useDocumentTabsStore.getState().activeTabId !== tab.id) {
        setNotice({ message: '该文件在其他页签有未保存修改，请先切换到该页签并处理修改后再刷新。', level: 'info' })
        return
      }
      runOrConfirm(async () => {
        try {
          if (!tab) {
            await openDocument(path)
            return
          }
          const diskContent = await fileService.readTextFile(path)
          useDocumentTabsStore.getState().reloadDocument(tab.id, diskContent)
          useHistoryStore.getState().updateContentFingerprint(path, createContentFingerprint(diskContent))
          useFileStore.getState().setExternalChange(false)
        } catch (error) {
          console.error('刷新历史文件失败:', error)
          setNotice({ message: '无法从磁盘重新读取该 Markdown 文件。', level: 'error' })
        }
      })
    }
    window.addEventListener('md-reader:refresh-path', handleRefreshPath)
    return () => window.removeEventListener('md-reader:refresh-path', handleRefreshPath)
  }, [openDocument, runOrConfirm])

  // Toolbar and other shallow UI surfaces request opens through one guarded route.
  useEffect(() => {
    const handleOpenPath = (event: Event) => {
      const path = (event as CustomEvent<string>).detail
      if (typeof path === 'string' && path) openPath(path)
    }
    window.addEventListener('md-reader:open-path', handleOpenPath)
    return () => window.removeEventListener('md-reader:open-path', handleOpenPath)
  }, [openPath])

  // The renderer remains single-document; this bridge restores the selected tab
  // into the established file store and leaves a no-tab document as the legacy fallback.
  useEffect(() => {
    if (isTransientPreviewWindow) return
    const active = tabs.find((tab) => tab.id === activeTabId)
    if (!active) {
      if (tabs.length === 0 && activeTabId === null && currentPath !== null) {
        restoreDocument({ path: null, content: '', mode: 'read' })
      }
      return
    }
    if (active.path === currentPath && active.content === content && active.isDirty === isModified) return
    // A local edit arrives through the legacy file store first. Let the next
    // effect checkpoint it into the active tab instead of briefly restoring
    // stale tab content over the user's keystroke.
    if (active.path === currentPath && active.content !== content && isModified) return
    restoreDocument({
      path: active.path,
      content: active.content,
      savedContent: active.savedContent,
      isModified: active.isDirty,
      mode,
    })
  }, [activeTabId, content, currentPath, isModified, isTransientPreviewWindow, mode, restoreDocument, tabs])

  useEffect(() => {
    if (isTransientPreviewWindow) return
    const active = tabs.find((tab) => tab.id === activeTabId)
    if (!active || active.path !== currentPath) return
    if (active.content !== content) updateContent(active.id, content)
    if (!isModified && active.isDirty && active.content === content) markSaved(active.id)
  }, [activeTabId, content, currentPath, isModified, isTransientPreviewWindow, markSaved, tabs, updateContent])

  useEffect(() => {
    if (!hasLoadedPersistence) return
    if (!isModified) {
      void persistService.clearRecoveryDraft()
      return
    }
    const timer = window.setTimeout(() => {
      void persistService.saveRecoveryDraft({ path: currentPath, content, updatedAt: Date.now() })
    }, 500)
    return () => window.clearTimeout(timer)
  }, [content, currentPath, hasLoadedPersistence, isModified])

  // Windows 原生拖放与关闭保护；浏览器预览同时保留标准 beforeunload 提示。
  useEffect(() => {
    const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path)
    let unlistenDrop: (() => void) | undefined
    let unlistenClose: (() => void) | undefined

    if (!isTauri()) return

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      const windowHandle = getCurrentWindow()
      nativeWindowRef.current = windowHandle
      // Register close protection first. Drag/drop is useful but must never be
      // able to prevent the main window from receiving close requests.
      unlistenClose = await windowHandle.onCloseRequested((event) => {
        const hasUnsavedTabs = useDocumentTabsStore.getState().tabs.some((tab) => tab.isDirty)
        if ((!useFileStore.getState().isModified && !hasUnsavedTabs) || allowCloseRef.current) return
        event.preventDefault()
        setIsAppCloseRequested(true)
      })
      unlistenDrop = await windowHandle.onDragDropEvent(({ payload }) => {
        if (payload.type === 'drop') {
          const path = payload.paths.find(isMarkdown)
          if (path) openPath(path)
        }
      })
    }).catch((error) => console.error('窗口事件初始化失败:', error))

    return () => {
      unlistenDrop?.()
      unlistenClose?.()
    }
  }, [openPath])

  // Browser development/preview has no Tauri drag-drop event, so retain the
  // same user-facing drop affordance there without attempting path access.
  useEffect(() => {
    if (isTauri()) return
    const prevent = (event: DragEvent) => event.preventDefault()
    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
      setIsBrowserDropActive(Boolean(event.dataTransfer?.files && isMarkdownDrop(event.dataTransfer.files)))
    }
    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      setIsBrowserDropActive(false)
      const file = [...(event.dataTransfer?.files ?? [])].find((candidate) => /\.(md|markdown)$/i.test(candidate.name))
      if (!file) return
      openPath(fileService.registerBrowserFile(file))
    }
    window.addEventListener('dragenter', prevent)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', prevent)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', prevent)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', prevent)
      window.removeEventListener('drop', handleDrop)
    }
  }, [openPath])

  useEffect(() => {
    const handleNewDocument = () => {
      const id = `untitled:${crypto.randomUUID()}`
      const initial = '# 未命名文档\n\n开始书写...\n'
      openTab({ id, title: '未命名文档', content: initial })
      restoreDocument({ path: null, content: initial, mode: 'edit' })
    }
    window.addEventListener('md-reader:new-document', handleNewDocument)
    return () => window.removeEventListener('md-reader:new-document', handleNewDocument)
  }, [openTab, restoreDocument])

  const dismissOnboarding = useCallback(() => {
    dismissFirstLaunch()
    setShowFirstLaunch(false)
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveCurrentDocument().catch((error) => console.error('快捷键保存失败:', error))
      }
      if (event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void fileService.openFileDialog().then((path) => { if (path) openPath(path) })
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        window.dispatchEvent(new Event('md-reader:find'))
      }
      if (event.key.toLowerCase() === 'e') {
        event.preventDefault()
        setMode(mode === 'edit' ? 'read' : 'edit')
      }
      if (event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setIsCommandPaletteOpen(true)
      }
      if (mode === 'edit' && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent<'undo' | 'redo'>('md-reader:document-history', { detail: event.shiftKey ? 'redo' : 'undo' }))
      }
      if (mode === 'edit' && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent<'redo'>('md-reader:document-history', { detail: 'redo' }))
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, openPath])

  useEffect(() => {
    if (isTauri()) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isModified) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isModified])

  useEffect(() => {
    let timer: number | undefined
    const handleNotice = (event: Event) => {
      const nextNotice = (event as CustomEvent<AppNotice>).detail
      setNotice(nextNotice)
      if (timer) window.clearTimeout(timer)
      timer = window.setTimeout(() => setNotice(null), 4500)
    }
    window.addEventListener(NOTICE_EVENT, handleNotice)
    return () => {
      window.removeEventListener(NOTICE_EVENT, handleNotice)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  // 历史或收藏变动时自动落盘
  useEffect(() => {
    if (isTransientPreviewWindow) return
    if (!hasLoadedPersistence) return
    if (history.length > 0) {
      void persistService.saveStore()
    }
  }, [hasLoadedPersistence, history, isTransientPreviewWindow])

  // 主题变更时自动落盘
  useEffect(() => {
    if (isTransientPreviewWindow) return
    if (!hasLoadedPersistence) return
    void persistService.saveStore()
  }, [hasLoadedPersistence, isTransientPreviewWindow, theme])

  useEffect(() => {
    if (isTransientPreviewWindow) return
    if (!hasLoadedPersistence) return
    void persistService.saveStore()
  }, [contentWidth, fontFamily, fontSize, hasLoadedPersistence, isSidebarOpen, isTocOpen, isTransientPreviewWindow, lineHeight])

  if (!hasClassifiedWindow) return null
  if (isTransientPreviewWindow) {
    return <div className="app-shell quick-preview-shell h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-sm" data-theme={theme}>
      <div className="app-document-host h-full w-full bg-[var(--bg-app)]"><MarkdownView compact /></div>
      <QuickPreviewRuntime onError={(message) => setNotice({ message, level: 'error' })} />
      {notice && <div role="status" className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-[var(--text-primary)] px-4 py-2 text-sm text-[var(--paper)] shadow-lg">{notice.message}</div>}
    </div>
  }

  return (
    <div 
      className="app-shell h-screen w-screen flex flex-col overflow-hidden text-sm transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-app)',
        color: 'var(--text-primary)',
        fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif'
      }}
      data-theme={theme}
    >
      {/* 顶部工具栏 */}
      <div className="app-toolbar"><Toolbar /></div>

      <div className="app-document-tabs">
        <DocumentTabs
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={activateDocumentTab}
          onRequestClose={requestCloseDocumentTab}
        />
      </div>

      {/* 主干区域 */}
      <div className="app-main flex-1 flex min-h-0 overflow-hidden">
        {/* 左侧固定侧边栏 */}
        {isSidebarOpen && <div className="app-sidebar hidden lg:block"><Sidebar /></div>}

        {/* 中间主内容区 */}
        <div className="app-document-host flex-1 min-w-0 h-full relative bg-[var(--bg-app)]">
          {mode === 'read' ? (
            <MarkdownView />
          ) : (
            <Editor />
          )}
          {showFirstLaunch && !currentPath && (
            <FirstLaunchCard
              isDropActive={isBrowserDropActive}
              onDismiss={dismissOnboarding}
              onOpen={() => { dismissOnboarding(); void fileService.openFileDialog().then((path) => { if (path) openPath(path) }) }}
            />
          )}
        </div>

        {/* 右侧导航目录栏 */}
        {mode === 'read' && isTocOpen && (
          <div className="app-toc hidden lg:block w-[210px] h-full border-l border-[var(--border)] flex-shrink-0 bg-[var(--bg-app)]">
            <Toc />
          </div>
        )}
      </div>

      {/* 底部状态栏：为窗口底部提供视觉边界，并展示当前文档与模式信息 */}
      <div className="app-statusbar flex-shrink-0 h-7 flex items-center justify-between px-4 border-t border-[var(--border)] bg-[var(--panel)] text-[11px] text-[var(--text-muted)] select-none">
        <span className="flex items-center gap-1.5 min-w-0">
          {isModified && <span className="text-[var(--accent)]" aria-hidden>●</span>}
          <span className="truncate">{currentPath ? currentPath.split(/[/\\]/).pop() : '未命名文档'}</span>
        </span>
        <span className="flex items-center gap-3 flex-shrink-0">
          <span>{content.length.toLocaleString()} 字符</span>
          <span>{mode === 'read' ? '阅读' : '编辑'}</span>
        </span>
      </div>
      {dialog}
      <UnsavedChangesDialog
        open={tabCloseCandidate !== null}
        isSaving={false}
        onCancel={() => setTabCloseCandidate(null)}
        onDiscard={() => {
          if (tabCloseCandidate) discardAndClose(tabCloseCandidate)
          setTabCloseCandidate(null)
        }}
        onSave={() => {
          const id = tabCloseCandidate
          if (!id) return
          void saveDocumentTab(id).then((saved) => {
            if (!saved) return
            markSaved(id)
            closeTab(id)
            setTabCloseCandidate(null)
          }).catch((error) => console.error('关闭页签前保存失败:', error))
        }}
      />
      <UnsavedChangesDialog
        open={isAppCloseRequested}
        isSaving={isAppCloseSaving}
        title="尚未保存的文档"
        description={tabs.filter((tab) => tab.isDirty).length > 1 ? '仍有多个未保存的文档。选择“保存并退出”会依次保存每个文档；取消任一另存为操作将保留窗口和未保存内容。' : '退出前请保存当前修改，或确认放弃修改并退出。'}
        discardLabel="放弃并退出"
        saveLabel="保存并退出"
        onCancel={() => setIsAppCloseRequested(false)}
        onDiscard={() => {
          setIsAppCloseRequested(false)
          void persistService.clearRecoveryDraft().then(requestNativeClose).catch((error) => {
            setNotice({ message: `清理恢复草稿失败，窗口未关闭：${error instanceof Error ? error.message : '未知错误'}`, level: 'error' })
          })
        }}
        onSave={() => void saveAndCloseNativeWindow()}
      />
      {notice && (
        <div role="status" className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-lg ${notice.level === 'error' ? 'bg-red-700 text-white' : 'bg-[var(--text-primary)] text-[var(--paper)]'}`}>
          {notice.message}
        </div>
      )}
      <RecoveryDialog
        open={recoveryDraft !== null}
        onDiscard={() => {
          setRecoveryDraft(null)
          void persistService.clearRecoveryDraft()
        }}
        onRestore={() => {
          if (!recoveryDraft) return
          // Respond immediately. A recovered document intentionally remains
          // dirty until Save, so its draft must not be deleted before reopening.
          const draft = recoveryDraft
          setRecoveryDraft(null)
          const id = draft.path ?? `untitled:${crypto.randomUUID()}`
          const existing = draft.path ? useDocumentTabsStore.getState().tabs.find((tab) => tab.path === draft.path) : undefined
          if (existing) {
            useDocumentTabsStore.getState().restoreDraft(existing.id, draft.content)
            activateTab(existing.id)
          } else {
            openTab({ id, path: draft.path, title: draft.path ? fileService.getFileName(draft.path) : '恢复的未命名草稿', content: draft.content })
            useDocumentTabsStore.getState().restoreDraft(id, draft.content)
          }
          restoreDocument({
            path: draft.path,
            content: draft.content,
            savedContent: null,
            isModified: true,
            mode: 'edit',
          })
        }}
      />
      <CommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        commands={[
          { label: '打开 Markdown 文件', hint: 'Ctrl+O', run: () => { void fileService.openFileDialog().then((path) => { if (path) openPath(path) }) } },
          { label: '保存当前文档', hint: 'Ctrl+S', run: () => { void saveCurrentDocument() } },
          { label: '切换左侧栏', hint: '', run: toggleSidebar },
          { label: '切换目录栏', hint: '', run: toggleToc },
          { label: '安装资源管理器快速预览', hint: '', run: () => { void import('@tauri-apps/api/core').then(({ invoke }) => invoke('install_explorer_quick_preview')).then(() => setNotice({ message: '已安装资源管理器右键快速预览；无需常驻后台。', level: 'info' })).catch((error) => setNotice({ message: `安装快速预览失败：${String(error)}`, level: 'error' })) } },
          { label: '移除资源管理器快速预览', hint: '', run: () => { void import('@tauri-apps/api/core').then(({ invoke }) => invoke('remove_explorer_quick_preview')).then(() => setNotice({ message: '已移除资源管理器快速预览入口。', level: 'info' })).catch((error) => setNotice({ message: `移除快速预览失败：${String(error)}`, level: 'error' })) } },
        ]}
      />
      <QuickPreviewRuntime onError={(message) => setNotice({ message, level: 'error' })} />
      <LiveMirrorPreviewRuntime onError={(message) => setNotice({ message, level: 'error' })} />
    </div>
  )
}

export default App
