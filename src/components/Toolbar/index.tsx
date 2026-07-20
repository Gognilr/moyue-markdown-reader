// 顶部工具栏
// 左侧：打开、新建、保存、收藏；右侧：阅读/编辑切换、主题切换

import { useFileStore } from '../../store/useFileStore'
import { useHistoryStore } from '../../store/useHistoryStore'
import { useThemeStore, Theme } from '../../store/useThemeStore'
import { fileService } from '../../services/fileService'
import { saveCurrentDocument } from '../../services/documentService'
import { showNotice } from '../../services/noticeService'
import { useLayoutStore } from '../../store/useLayoutStore'
import { isTauri } from '../../services/fileService'
import { downloadOpenZipPackage, downloadStandaloneHtml } from '../../features/format-package/formatPackageDownload'
import { importOpenZipPackage } from '../../features/format-package/importOpenZipPackage'
import { isOpenPackagePath } from '../../features/format-package/importOpenZipPackage'
import { assessExportConfidence, preflightExport, type ExportPreflightReport } from '../../features/export/exportPreflight'
import { applyExportOnlyResolutions, canProceedWithExport, createPreflightResolutionState, setAutomaticFixApplied, setExportOnlyChoice, type ExportPreflightResolutionState } from '../../features/export/exportPreflightResolution'
import { exportTemplates, getExportTemplate, type ExportTemplateId } from '../../features/export/exportTemplates'
import { extractExportMetadata } from '../../features/export/exportMetadata'
import { resolveDocxLogo } from '../../features/export/docxLogo'
import { ExportPreflightPanel } from '../ExportPreflight/ExportPreflightPanel'
import { collectInspectableLocalReferences, inspectCurrentDocumentResources } from '../../features/health/localResourceInventory'
import { TypographyPersonalityPicker } from '../TypographyPersonalityPicker'
import { suggestReadingPersonality } from '../../features/reading-personality/readingPersonality'
import { snapReaderWindow, windowSnapNotice, type WindowSnapSide } from '../../features/window-snap/windowSnap'
import { applyActiveDocumentHistory, canApplyActiveDocumentHistory, type DocumentHistoryAction } from '../../features/document-tabs/documentHistoryActions'
import { useEffect, useState } from 'react'
import { FolderOpen, Save, Star, FilePlus, Eye, Edit3, PanelLeft, PanelRight, Type, FileDown, FileCode2, Archive, Pin, ChevronLeft, ChevronRight, SlidersHorizontal, Undo2, Redo2, Printer } from 'lucide-react'

interface AdjacentMarkdownPaths {
  previous: string | null
  next: string | null
}

export function Toolbar() {
  const { currentPath, content, isModified, hasExternalChange, mode, setMode, setContent, setModified, setExternalChange } = useFileStore()
  const { toggleFavorite, history } = useHistoryStore()
  const { theme, setTheme } = useThemeStore()
  const { fontSize, setFontSize, toggleSidebar, toggleToc } = useLayoutStore()
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false)
  const [adjacentPaths, setAdjacentPaths] = useState<AdjacentMarkdownPaths>({ previous: null, next: null })
  const [preflightReport, setPreflightReport] = useState<ExportPreflightReport | null>(null)
  const [preflightResolution, setPreflightResolution] = useState<ExportPreflightResolutionState | null>(null)
  const [lastExportResult, setLastExportResult] = useState<{ format: 'DOCX' | 'PDF'; report: ExportPreflightReport; location: string } | null>(null)
  const [exportStage, setExportStage] = useState<{ format: 'DOCX' | 'PDF'; message: string } | null>(null)
  const [pendingExportFormat, setPendingExportFormat] = useState<'DOCX' | 'PDF' | null>(null)
  const [exportTemplateId, setExportTemplateId] = useState<ExportTemplateId>('technical-report')
  const [isTypographyPickerOpen, setIsTypographyPickerOpen] = useState(false)
  const documentKind = suggestReadingPersonality(content).kind
  const canUndo = canApplyActiveDocumentHistory('undo', currentPath)
  const canRedo = canApplyActiveDocumentHistory('redo', currentPath)

  const currentItem = history.find(item => item.path === currentPath)
  const isFavorite = currentItem ? currentItem.isFavorite : false
  const exportTemplate = getExportTemplate(exportTemplateId)
  const fileName = currentPath ? fileService.getFileName(currentPath) : '未打开文件'
  const isPackagePreview = isOpenPackagePath(currentPath)

  /** 打开本地 .md 文件 */
  useEffect(() => {
    let cancelled = false
    if (!currentPath || !isTauri()) {
      setAdjacentPaths({ previous: null, next: null })
      return
    }

    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke<AdjacentMarkdownPaths>('adjacent_markdown_paths', { currentPath })
    ).then((paths) => {
      if (!cancelled) setAdjacentPaths(paths)
    }).catch((error) => {
      console.error('Unable to read adjacent Markdown files:', error)
      if (!cancelled) setAdjacentPaths({ previous: null, next: null })
    })

    return () => { cancelled = true }
  }, [currentPath])

  const handleAlwaysOnTop = async () => {
    if (!isTauri()) return
    const nextValue = !isAlwaysOnTop
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('set_always_on_top', { alwaysOnTop: nextValue })
      setIsAlwaysOnTop(nextValue)
      showNotice(nextValue ? '已开启始终置顶。' : '已关闭始终置顶。')
    } catch (error) {
      console.error('Unable to toggle always-on-top:', error)
      showNotice('无法切换始终置顶，请检查原生窗口权限。', 'error')
    }
  }

  const handleWindowSnap = async (side: WindowSnapSide) => {
    const result = await snapReaderWindow(side)
    showNotice(windowSnapNotice(side, result), result.performed ? 'info' : 'error')
  }

  const handleAdjacentDocument = async (path: string | null) => {
    if (!path || !isTauri()) return
    window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: path }))
  }

  const handleOpen = async () => {
    const path = await fileService.openFileDialog()
    if (!path) return

    window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: path }))
  }

  const handleImportOpenPackage = async () => {
    try {
      const selected = await fileService.pickOpenPackage()
      if (!selected) return
      const imported = importOpenZipPackage(selected.name, selected.bytes)
      window.dispatchEvent(new CustomEvent('md-reader:open-package', { detail: imported }))
    } catch (error) {
      console.error('Unable to import open ZIP package:', error)
      showNotice(error instanceof Error ? `无法打开随身包：${error.message}` : '无法打开随身包。', 'error')
    }
  }

  /** 新建空白文档 */
  const handleNew = () => {
    window.dispatchEvent(new Event('md-reader:new-document'))
  }

  /** 保存当前文档（有路径直接写，无路径弹保存对话框） */
  const handleSave = async () => {
    try {
      await saveCurrentDocument()
    } catch (e) {
      console.error('保存文件失败:', e)
      showNotice('保存失败，请检查文件路径和权限。', 'error')
    }
  }

  const handleDocumentHistory = (action: DocumentHistoryAction) => {
    const result = applyActiveDocumentHistory(action, { path: currentPath, content })
    if (!result) return
    setContent(result.content)
    setModified(result.isModified)
  }

  const handlePrint = () => {
    if (!content.trim()) {
      showNotice('请先打开一个 Markdown 文档再打印。', 'info')
      return
    }

    const previousMode = mode
    if (previousMode !== 'read') setMode('read')
    // Wait for React to render the isolated reading surface before invoking the
    // system print dialog. `window.print()` blocks until that dialog closes in
    // the desktop WebView, after which the user's previous mode can be restored.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print()
      if (previousMode !== 'read') setMode(previousMode)
    }))
  }

  const handleExportTemplateChange = (nextTemplateId: ExportTemplateId) => {
    setExportTemplateId(nextTemplateId)
    const template = getExportTemplate(nextTemplateId)
    showNotice(`导出模板已切换为“${template.label}”；下次导出 Word/PDF 时生效。`, 'success')
  }

  useEffect(() => {
    const handleHistoryEvent = (event: Event) => {
      const action = (event as CustomEvent<DocumentHistoryAction>).detail
      if (action === 'undo' || action === 'redo') handleDocumentHistory(action)
    }
    window.addEventListener('md-reader:document-history', handleHistoryEvent)
    return () => window.removeEventListener('md-reader:document-history', handleHistoryEvent)
  }, [content, currentPath])

  const handleExportDocx = async () => {
    setPendingExportFormat('DOCX')
    setExportStage({ format: 'DOCX', message: '正在进行导出预检…' })
    try {
      const [{ markdownToDocumentIR }, { downloadDocx }] = await Promise.all([
        import('../../features/export/markdownToIr'),
        import('../../features/export/docxExport'),
      ])
      const document = markdownToDocumentIR(content)
      const resourceInventory = await inspectCurrentDocumentResources(currentPath, collectInspectableLocalReferences(content))
      const report = preflightExport(document, { sourceMarkdown: content, resourceInventory })
      setPreflightReport(report)
      const resolution = preflightResolution && preflightReport?.issues.map((issue) => issue.id).join('|') === report.issues.map((issue) => issue.id).join('|')
        ? preflightResolution
        : createPreflightResolutionState(report)
      if (!preflightResolution || resolution !== preflightResolution) setPreflightResolution(resolution)
      if (!canProceedWithExport(report, resolution)) {
        showNotice('请在导出预检中完成选择或处理无法保证的资源。', 'error')
        return
      }
      const baseName = fileService.getFileName(currentPath || 'document.md', false)
      const metadata = await resolveDocxLogo(extractExportMetadata(content, baseName), currentPath)
      setExportStage({ format: 'DOCX', message: '正在生成 Word 文档，并等待选择保存位置…' })
      const result = await downloadDocx(applyExportOnlyResolutions(document, report, resolution), `${baseName}.docx`, {
        template: exportTemplate,
        metadata,
        sourcePath: currentPath ?? undefined,
      })
      if (!result) {
        showNotice('已取消 Word 导出，未写入任何文件。', 'info')
        setPreflightReport(null)
        setPreflightResolution(null)
        setPendingExportFormat(null)
        return
      }
      const assessment = assessExportConfidence(report.issues)
      const location = result.kind === 'native' ? result.path : `浏览器下载：${result.fileName}`
      setLastExportResult({ format: 'DOCX', report, location })
      setPreflightReport(null)
      setPreflightResolution(null)
      setPendingExportFormat(null)
      showNotice(`Word 已导出到：${location}；${assessment.label}。`, assessment.grade === 'A' ? 'success' : 'info')
    } catch (error) {
      console.error('导出 DOCX 失败:', error)
      showNotice('DOCX 导出失败，请检查文档内容后重试。', 'error')
    } finally {
      setExportStage(null)
    }
  }

  const handleExportPdf = async () => {
    setPendingExportFormat('PDF')
    setExportStage({ format: 'PDF', message: '正在进行导出预检…' })
    try {
      const [{ markdownToDocumentIR }, { downloadPdf }] = await Promise.all([
        import('../../features/export/markdownToIr'),
        import('../../features/export/pdfExport'),
      ])
      const document = markdownToDocumentIR(content)
      const resourceInventory = await inspectCurrentDocumentResources(currentPath, collectInspectableLocalReferences(content))
      const report = preflightExport(document, { sourceMarkdown: content, resourceInventory })
      setPreflightReport(report)
      const resolution = preflightResolution && preflightReport?.issues.map((issue) => issue.id).join('|') === report.issues.map((issue) => issue.id).join('|')
        ? preflightResolution
        : createPreflightResolutionState(report)
      if (!preflightResolution || resolution !== preflightResolution) setPreflightResolution(resolution)
      if (!canProceedWithExport(report, resolution)) {
        showNotice('请在导出预检中完成选择或处理无法保证的资源。', 'error')
        return
      }
      const baseName = fileService.getFileName(currentPath || 'document.md', false)
      setExportStage({ format: 'PDF', message: '正在生成 PDF，并等待选择保存位置…' })
      const result = await downloadPdf(applyExportOnlyResolutions(document, report, resolution), `${baseName}.pdf`, { title: baseName, template: exportTemplate, sourcePath: currentPath ?? undefined })
      if (!result) {
        showNotice('已取消 PDF 导出，未写入任何文件。', 'info')
        setPreflightReport(null)
        setPreflightResolution(null)
        setPendingExportFormat(null)
        return
      }
      const assessment = assessExportConfidence(report.issues)
      const location = result.kind === 'native' ? result.path : `浏览器下载：${result.fileName}`
      setLastExportResult({ format: 'PDF', report, location })
      setPreflightReport(null)
      setPreflightResolution(null)
      setPendingExportFormat(null)
      showNotice(`PDF 已导出到：${location}；${assessment.label}。`, assessment.grade === 'A' ? 'success' : 'info')
    } catch (error) {
      console.error('导出 PDF 失败:', error)
      showNotice('PDF 导出失败，请检查文档内容后重试。', 'error')
    } finally {
      setExportStage(null)
    }
  }

  const handleDownloadStandaloneHtml = async () => {
    try {
      const sourceName = fileService.getFileName(currentPath || 'document.md')
      await downloadStandaloneHtml({ sourceName, markdown: content })
      showNotice('已开始下载自包含 HTML 阅读副本。')
    } catch (error) {
      console.error('Unable to download standalone HTML:', error)
      showNotice('自包含 HTML 下载失败，请稍后重试。', 'error')
    }
  }

  const handleDownloadOpenPackage = async () => {
    try {
      const sourceName = fileService.getFileName(currentPath || 'document.md')
      await downloadOpenZipPackage({ sourceName, markdown: content })
      showNotice('已开始下载开放 ZIP 随身包；可用任意 ZIP 工具解包查看普通文件。')
    } catch (error) {
      console.error('Unable to download open ZIP package:', error)
      showNotice('开放 ZIP 随身包下载失败，请稍后重试。', 'error')
    }
  }

  return (
    <div data-testid="app-toolbar" className="h-12 w-full overflow-x-auto bg-[var(--panel)] border-b border-[var(--border)] px-4 flex items-center gap-4 select-none">
      {/* 左侧核心操作 */}
      <div className="flex min-w-max items-center gap-1">
        <button
          data-testid="open-markdown"
          onClick={handleOpen}
          title="打开文件"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <FolderOpen size={16} />
        </button>
        <button
          type="button"
          onClick={() => void handleImportOpenPackage()}
          title="导入只读开放 ZIP 随身包"
          aria-label="导入只读开放 ZIP 随身包"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Archive size={16} />
        </button>
        <button
          data-testid="new-document"
          onClick={handleNew}
          title="新建文件"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <FilePlus size={16} />
        </button>
        <button
          data-testid="save-document"
          onClick={handleSave}
          title="保存文件"
          className={`p-2 rounded-lg hover:bg-[var(--hover)] transition-colors ${
            isModified ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Save size={16} />
        </button>
        <button
          data-testid="print-document"
          type="button"
          onClick={handlePrint}
          disabled={!content.trim()}
          title={content.trim() ? '打印当前文档' : '请先打开文档'}
          aria-label="打印当前文档"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Printer size={16} />
        </button>
        <button
          type="button"
          onClick={() => handleDocumentHistory('undo')}
          disabled={!canUndo}
          aria-label="撤销当前文档修改"
          title="撤销（Ctrl+Z）"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => handleDocumentHistory('redo')}
          disabled={!canRedo}
          aria-label="重做当前文档修改"
          title="重做（Ctrl+Y / Ctrl+Shift+Z）"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Redo2 size={16} />
        </button>
        <button
          data-testid="export-docx"
          onClick={() => void handleExportDocx()}
          disabled={exportStage !== null}
          title={exportStage ? exportStage.message : '导出可编辑 Word'}
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:cursor-wait disabled:opacity-50"
        >
          <FileDown size={16} />
        </button>
        <button
          data-testid="export-pdf"
          onClick={() => void handleExportPdf()}
          disabled={exportStage !== null}
          title={exportStage ? exportStage.message : '导出 PDF'}
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:cursor-wait disabled:opacity-50"
        >
          <span className="text-xs font-bold">PDF</span>
        </button>
        <label className="ml-1 flex items-center gap-1 text-xs text-[var(--text-secondary)]" title="仅影响 DOCX/PDF 导出，不会修改当前 Markdown">
          <span>导出模板</span>
          <select
            aria-label="DOCX/PDF 导出模板"
            value={exportTemplateId}
            onChange={(event) => handleExportTemplateChange(event.target.value as ExportTemplateId)}
            className="max-w-28 rounded border border-[var(--border)] bg-[var(--paper)] px-1 py-1 text-xs text-[var(--text-primary)]"
          >
            {exportTemplates.map((template) => <option key={template.id} value={template.id}>导出 · {template.label}</option>)}
          </select>
        </label>
        <button
          onClick={() => void handleDownloadStandaloneHtml()}
          title="下载自包含 HTML"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <FileCode2 size={16} />
        </button>
        <button
          onClick={() => void handleDownloadOpenPackage()}
          title="下载开放 ZIP 随身包"
          className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Archive size={16} />
        </button>

        {isTauri() && currentPath && (
          <>
            <div className="w-[1px] h-4 bg-[var(--border)] mx-1" />
            <button
              onClick={() => void handleAdjacentDocument(adjacentPaths.previous)}
              disabled={!adjacentPaths.previous}
              title="上一个 Markdown 文件"
              className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => void handleAdjacentDocument(adjacentPaths.next)}
              disabled={!adjacentPaths.next}
              title="下一个 Markdown 文件"
              className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => void handleAlwaysOnTop()}
              title={isAlwaysOnTop ? '关闭始终置顶' : '始终置顶'}
              aria-pressed={isAlwaysOnTop}
              className={`p-2 rounded-lg hover:bg-[var(--hover)] transition-colors ${isAlwaysOnTop ? 'text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              <Pin size={16} />
            </button>
          </>
        )}

        {isTauri() && (
          <>
            <div className="w-[1px] h-4 bg-[var(--border)] mx-1" />
            <button
              type="button"
              onClick={() => void handleWindowSnap('left')}
              title="贴靠至当前屏幕左半区"
              aria-label="贴靠至当前屏幕左半区"
              className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            ><PanelLeft size={16} /></button>
            <button
              type="button"
              onClick={() => void handleWindowSnap('right')}
              title="贴靠至当前屏幕右半区"
              aria-label="贴靠至当前屏幕右半区"
              className="p-2 rounded-lg hover:bg-[var(--hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            ><PanelRight size={16} /></button>
          </>
        )}

        {currentPath && (
          <>
            <div className="w-[1px] h-4 bg-[var(--border)] mx-1" />
            <button
              onClick={() => toggleFavorite(currentPath)}
              className="p-2 rounded-lg hover:bg-[var(--hover)] transition-colors"
              title={isFavorite ? '取消收藏' : '添加收藏'}
            >
              <Star
                size={16}
                className={isFavorite ? 'text-[var(--accent)] fill-[var(--accent)]' : 'text-[var(--text-secondary)]'}
              />
            </button>
          </>
        )}

        <div className="w-[1px] h-4 bg-[var(--border)] mx-1" />
        <span className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 font-medium ml-1">
          {currentPath && <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />}
          {fileName} {isModified && <span className="text-[var(--accent)] font-semibold">(已修改)</span>}
        </span>
      </div>

      {/* 右侧：阅读/编辑切换与主题切换 */}
      <div className="ml-auto flex flex-none items-center gap-3">
        <div className="flex items-center gap-0.5">
          <button onClick={toggleSidebar} title="切换左侧栏" className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover)]"><PanelLeft size={15} /></button>
          <button onClick={() => setFontSize(fontSize - 1)} title="减小字号" className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover)]"><Type size={13} /></button>
          <button onClick={() => setFontSize(fontSize + 1)} title="增大字号" className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover)]"><Type size={17} /></button>
          <button onClick={toggleToc} title="切换目录栏" className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--hover)]"><PanelRight size={15} /></button>
          <button
            type="button"
            onClick={() => setIsTypographyPickerOpen((open) => !open)}
            aria-label="打开阅读版式与排版人格"
            aria-expanded={isTypographyPickerOpen}
            title="阅读版式与排版人格"
            className={`p-1.5 rounded-lg transition-colors ${isTypographyPickerOpen ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--hover)]'}`}
          ><SlidersHorizontal size={15} /></button>
        </div>
        {/* 阅读/编辑切换 Pill */}
        <div className="flex bg-[var(--hover)] p-0.5 rounded-full relative">
          <button
            data-testid="read-mode"
            onClick={() => setMode('read')}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
              mode === 'read' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Eye size={12} />
            阅读
          </button>
          <button
            data-testid="edit-mode"
            onClick={() => setMode('edit')}
            disabled={isPackagePreview}
            title={isPackagePreview ? '开放 ZIP 随身包仅支持只读预览' : '编辑'}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 ${mode === 'edit' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'} ${isPackagePreview ? 'cursor-not-allowed opacity-35' : ''}`}
          >
            <Edit3 size={12} />
            编辑
          </button>
        </div>

        {/* 主题切换 */}
        <div className="flex items-center gap-1">
          {(['paper', 'light', 'dark'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`p-1.5 rounded-lg text-xs transition-all uppercase font-semibold ${
                theme === t
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover)]'
              }`}
            >
              {t === 'paper' ? '纸' : t === 'light' ? '浅' : '深'}
            </button>
          ))}
        </div>
      </div>
      {hasExternalChange && currentPath && (
        <div className="absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-xs shadow-lg">
          <span className="mr-3 text-[var(--text-secondary)]">磁盘文件已被外部修改。</span>
          <button className="mr-2 text-[var(--accent)] hover:underline" onClick={() => window.dispatchEvent(new CustomEvent<string>('md-reader:reload-path', { detail: currentPath }))}>采用磁盘版本</button>
          <button className="text-[var(--text-secondary)] hover:underline" onClick={() => setExternalChange(false)}>保留本地修改</button>
        </div>
      )}
      {preflightReport && (
        <div className="absolute right-4 top-14 z-40 w-[min(28rem,calc(100vw-2rem))]">
          <ExportPreflightPanel
            report={preflightReport}
            template={exportTemplate}
            resolutionState={preflightResolution ?? createPreflightResolutionState(preflightReport)}
            onAutomaticFixChange={(issueId, applied) => setPreflightResolution((current) => setAutomaticFixApplied(current ?? createPreflightResolutionState(preflightReport), issueId, applied))}
            onChoiceChange={(issueId, choice) => setPreflightResolution((current) => setExportOnlyChoice(current ?? createPreflightResolutionState(preflightReport), issueId, choice))}
            onExport={() => pendingExportFormat === 'DOCX' ? void handleExportDocx() : void handleExportPdf()}
            exportLabel={pendingExportFormat === 'DOCX' ? '导出 Word' : '导出 PDF'}
            exportDisabled={!pendingExportFormat || !canProceedWithExport(preflightReport, preflightResolution ?? createPreflightResolutionState(preflightReport))}
            isExporting={exportStage !== null}
            onClose={() => { setPreflightReport(null); setPreflightResolution(null); setPendingExportFormat(null) }}
          />
        </div>
      )}
      {lastExportResult && !preflightReport && (
        <div role="status" className="absolute right-4 top-14 z-40 w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-[var(--border)] bg-[var(--paper)] p-3 text-xs text-[var(--text-secondary)] shadow-lg">
          <strong className="text-[var(--text-primary)]">{lastExportResult.format} 导出结果：{assessExportConfidence(lastExportResult.report.issues).label}</strong>
          <p className="mb-0 mt-1">证据：{lastExportResult.report.evidence.join(' ')}</p>
          <p className="mb-0 mt-1 break-all">保存位置：{lastExportResult.location}</p>
          {lastExportResult.report.downgradeReasons.length > 0 && <p className="mb-0 mt-1">降级原因：{lastExportResult.report.downgradeReasons.join('；')}</p>}
          <button type="button" className="mt-2 text-[var(--accent)] hover:underline" onClick={() => setLastExportResult(null)}>关闭</button>
        </div>
      )}
      {exportStage && (
        <div role="status" className="absolute right-4 top-14 z-40 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-xs text-[var(--text-secondary)] shadow-lg">
          {exportStage.format}：{exportStage.message}
        </div>
      )}
      {isTypographyPickerOpen && (
        <div className="absolute right-4 top-14 z-40 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100vh-5rem)] overflow-auto shadow-lg">
          <TypographyPersonalityPicker documentKey={currentPath} documentKind={documentKind} />
        </div>
      )}
    </div>
  )
}
