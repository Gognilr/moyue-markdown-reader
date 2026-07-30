// Markdown 主阅读视图
// 整合 react-markdown 渲染管线、本地图片解析、外链拦截、滚动位置记忆

import { useFileStore } from '../../store/useFileStore'
import { useHistoryStore } from '../../store/useHistoryStore'
import { useScrollMemory } from '../../features/scroll/useScrollMemory'
import { useLayoutStore } from '../../store/useLayoutStore'
import { useDocumentTabsStore } from '../../store/useDocumentTabsStore'
import { remarkPlugins, rehypePlugins } from './plugins'
import { createImageTransformer, createLinkClickHandler } from './linkHandler'
import { isValidElement, useDeferredValue, useRef, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { MermaidDiagram } from '../../components/MermaidDiagram'
import { ImageLightbox } from '../../components/ImageLightbox'
import { CodeBlock } from '../../components/CodeBlock'
import { TableView } from '../../components/TableView'
import { TableStudioPanel } from '../../components/TableStudio'
import { AnnotationTray } from '../../components/Annotations/AnnotationTray'
import { AnnotationWorkbench } from '../../components/Annotations/AnnotationWorkbench'
import { ReadingTasks } from '../../components/ReadingTasks'
import { localStorageAnnotationRepository, createEmptyDocumentAnnotations } from '../annotations/annotationRepository'
import { createTextAnchor } from '../annotations/textAnchor'
import { addAnnotation, addExcerpt, removeAnnotation, removeExcerpt } from '../annotations/annotationActions'
import { reorderExcerpts } from '../annotations/excerptTrayModel'
import { reviewExportMarkdown } from '../annotations/reviewExport'
import { annotationSidecarFileName, hasPortableAnnotationData, parseAnnotationSidecar, serializeAnnotationSidecar } from '../annotations/annotationSidecar'
import type { Annotation, DocumentAnnotations, Excerpt, TextAnchor } from '../../types'
import { applyRenderedAnnotations, findRenderedAnnotation, type AnnotationRenderStatus } from '../annotations/annotationRendering'
import { SemanticRibbon } from '../live-mirror/SemanticRibbonView'
import { LiveMirrorOverlayLegend } from '../live-mirror/LiveMirrorOverlayLegend'
import { createLiveMirrorOverlayIndex, updateLiveMirrorOverlayIndex, type LiveMirrorOverlay, type LiveMirrorOverlayOptions } from '../live-mirror/overlays'
import { openLiveMirrorPreview } from '../live-mirror/liveMirrorPreview'
import { ReadingFocus } from '../../components/ReadingFocus/ReadingFocus'
import { ProjectRoam } from '../../components/ProjectRoam'
import { verifyProjectDocuments, type ProjectVerificationReport } from '../project-roam/projectVerification'
import { includeCurrentProjectDocument, inspectScannedProjectResources, scanCurrentAuthorizedProject } from '../project-roam/projectScanner'
import { DocumentHealthPanel } from '../../components/DocumentHealth'
import { CognitiveRoutePanel } from '../../components/CognitiveRoute'
import { checkDocumentHealth, type ResourceInventory } from '../health/documentHealth'
import { collectInspectableLocalReferences, inspectCurrentDocumentResources } from '../health/localResourceInventory'
import { downloadDocumentHealthExport } from '../health/documentHealthExport'
import { buildCognitiveRoute, fingerprint } from '../cognitive-route/cognitiveRoute'
import { markdownToDocumentIR } from '../export/markdownToIr'
import { fileService, isTauri } from '../../services/fileService'
import type { ReadingBudget, ReadingPurpose } from '../../types'
import { captureViewportAnchor, restoreViewportAnchor, type ViewportAnchor } from '../scroll/viewportAnchor'
import { ReadingPersonality } from '../../components/ReadingPersonality'
import { suggestReadingPersonality } from '../reading-personality/readingPersonality'
import { hasReadableDocument } from '../reading-personality/readingSuggestionVisibility'
import { RecoveryCapsuleCard } from '../../components/RecoveryCapsule'
import { canUseReadingRecovery, createRecoveryCapsule, getRecoveryDocumentChangeImpact, loadRecoveryCapsule, removeRecoveryCapsule, saveRecoveryCapsule } from '../recovery/recoveryCapsule'
import { expandDisclosureBlocks } from '../recovery/resumeRecovery'
import { DocumentLensPanel } from '../../components/DocumentLens'
import { buildDocumentLens } from '../document-lens/documentLens'
import type { ReadingRecoveryCapsule, DocumentLensItem } from '../../types'
import { parseFootnotes, parseFrontMatter } from './syntaxExtensions'
import { CalloutAside, FootnoteList, FrontMatterSummaryCard } from './MarkdownSyntaxExtensions'
import { ScreenReaderAnnouncer } from '../../components/Accessibility/ScreenReaderAnnouncer'
import { readerLandmarkAria, searchStatusMessage } from '../accessibility/readerNavigation'
import { documentIrToCognitiveBlocks } from '../cognitive-route/cognitiveRoute'
import { localStorageReadingLedgerRepository } from '../reading-ledger/readingLedgerRepository'
import { readingStatesByAnchor, recordReadingState, type DocumentReadingLedger, type ReadingUnderstandingState } from '../reading-ledger/readingLedger'
import type { BlockAnchor } from '../../types'
import { RenderDiffPanel } from '../../components/RenderDiff'
import type { CompareEntry } from '../render-diff/documentCompare'
import { canReadDiskRevision, canUseLastSavedRevision, currentBlockForDiffEntry, diffEntrySearchText, makeDiskDiffSource, makeLastSavedDiffSource, makePickedFileDiffSource, type LocalDiffSource } from '../render-diff/diffSources'
import { canOpenVerifiedLightboxSource } from './lightboxSource'
import { createLargeDocumentModel, isLargeMarkdown } from './largeDocument'

// Soft-retired from the lightweight reader surface. Existing local/sidecar
// data remains untouched so this product decision never deletes user work.
const ENABLE_EXPERIMENTAL_READING_WORKBENCH = false
const ENABLE_ANNOTATION_WORKBENCH = false

/** Collect only explicit, document-relative Markdown images; native code
 * performs the authoritative path and MIME validation before bytes are read. */
export function collectMarkdownImageReferences(markdown: string, limit = 64): string[] {
  const references = new Set<string>()
  const pattern = /!\[[^\]]*\]\(\s*<?([^>\s)]+)>?(?:\s+["'][^)]*["'])?\s*\)/g
  for (const match of markdown.matchAll(pattern)) {
    const reference = match[1]
    const filePart = reference?.split(/[?#]/, 1)[0] ?? ''
    if (!filePart || /^[a-z][a-z\d+.-]*:/i.test(filePart) || /^[\\/]/.test(filePart) || filePart.split(/[\\/]/).includes('..')) continue
    references.add(reference)
    if (references.size >= limit) break
  }
  return [...references]
}

export function MarkdownView({ compact = false }: { compact?: boolean } = {}) {
  const { content, currentPath, isModified, lastSavedContent } = useFileStore()
  const tabs = useDocumentTabsStore((state) => state.tabs)
  const { fontFamily, fontSize, lineHeight, contentWidth, letterSpacing, paragraphSpacing, isVerticalReading, setLineHeight, setContentWidth, setLetterSpacing, setParagraphSpacing, toggleVerticalReading, applyReadingPreset } = useLayoutStore()
  const { handleScroll, restoreScrollPosition } = useScrollMemory()
  const containerRef = useRef<HTMLDivElement>(null)
  const markdownContentRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const pendingViewportAnchor = useRef<ViewportAnchor | null>(null)
  const pendingLargePageScrollRatio = useRef<number | null>(null)
  const pendingLargeHeadingId = useRef<string | null>(null)
  const readingStartedAt = useRef(Date.now())
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string; reference: string | null } | null>(null)
  const documentKey = currentPath ?? 'unsaved-document'
  const [annotations, setAnnotations] = useState<DocumentAnnotations>(() => createEmptyDocumentAnnotations(documentKey))
  const [annotationStatuses, setAnnotationStatuses] = useState<Record<string, AnnotationRenderStatus>>({})
  const [isAnnotationTrayOpen, setIsAnnotationTrayOpen] = useState(false)
  const [canMigrateAnnotationsToSidecar, setCanMigrateAnnotationsToSidecar] = useState(false)
  const [selection, setSelection] = useState<{ anchor: TextAnchor; text: string; x: number; y: number } | null>(null)
  const [isReaderToolsOpen, setIsReaderToolsOpen] = useState(false)
  const [isFocusControlsOpen, setIsFocusControlsOpen] = useState(false)
  const [isLayoutControlsOpen, setIsLayoutControlsOpen] = useState(false)
  const [isHealthOpen, setIsHealthOpen] = useState(false)
  const [isRoamOpen, setIsRoamOpen] = useState(false)
  const [isRouteOpen, setIsRouteOpen] = useState(false)
  const [isLensOpen, setIsLensOpen] = useState(false)
  const [isTableStudioOpen, setIsTableStudioOpen] = useState(false)
  const [isDiffOpen, setIsDiffOpen] = useState(false)
  const [diffSource, setDiffSource] = useState<LocalDiffSource | null>(null)
  const [isDiffLoading, setIsDiffLoading] = useState(false)
  const [isLiveMirrorOpen, setIsLiveMirrorOpen] = useState(false)
  const [recoveryCapsule, setRecoveryCapsule] = useState<ReadingRecoveryCapsule | null>(null)
  const [routePurpose, setRoutePurpose] = useState<ReadingPurpose>('quick-overview')
  const [routeBudget, setRouteBudget] = useState<ReadingBudget>(5)
  const [projectBackStack, setProjectBackStack] = useState<string[]>([])
  const [projectReport, setProjectReport] = useState<ProjectVerificationReport | null>(null)
  const [projectScanState, setProjectScanState] = useState<'idle' | 'scanning' | 'ready' | 'unavailable' | 'failed'>('idle')
  const [projectScanTruncated, setProjectScanTruncated] = useState(false)
  const [readerNotice, setReaderNotice] = useState<string | null>(null)
  const [largePageIndex, setLargePageIndex] = useState(0)
  const [isReadingSuggestionVisible, setIsReadingSuggestionVisible] = useState(true)
  const [readingLedger, setReadingLedger] = useState<DocumentReadingLedger | null>(null)
  const [resourceInventory, setResourceInventory] = useState<ResourceInventory>({})
  const [resourceInspectionState, setResourceInspectionState] = useState<'idle' | 'checking' | 'verified' | 'unavailable'>('idle')
  const [resolvedLocalImages, setResolvedLocalImages] = useState<Record<string, string>>({})
  const deferredContent = useDeferredValue(content)
  // Never scan the previous document while the newly selected document is
  // painting. The lightweight navigator catches up in React's deferred pass.
  const analysisContent = !compact && deferredContent === content && !isLargeMarkdown(content) ? deferredContent : ''
  const liveMirrorIndexRef = useRef(createLiveMirrorOverlayIndex(''))
  const [liveMirrorOverlays, setLiveMirrorOverlays] = useState<readonly LiveMirrorOverlay[]>(() => liveMirrorIndexRef.current.overlays)
  const prepareExperimentalReadingData = ENABLE_EXPERIMENTAL_READING_WORKBENCH && isReaderToolsOpen
  const resourceReferences = useMemo(() => prepareExperimentalReadingData ? collectInspectableLocalReferences(content) : [], [content, prepareExperimentalReadingData])
  const documentIr = useMemo(() => prepareExperimentalReadingData ? markdownToDocumentIR(content) : { kind: 'document' as const, blocks: [] }, [content, prepareExperimentalReadingData])
  const healthReport = useMemo(() => prepareExperimentalReadingData
    ? checkDocumentHealth(content, { resourceInventory })
    : { diagnostics: [], checkedAt: Date.now() }, [content, prepareExperimentalReadingData, resourceInventory])
  const readingSuggestion = useMemo(() => suggestReadingPersonality(content), [content])
  const canSuggestReadingLayout = hasReadableDocument(currentPath, content)
  const readingSuggestionStorageKey = useMemo(() => `md-reader:reading-suggestion-dismissed:${documentKey}`, [documentKey])
  const cognitiveRoute = useMemo(() => buildCognitiveRoute(documentIr, routePurpose, routeBudget), [documentIr, routePurpose, routeBudget])
  const routeReadingStates = useMemo(() => readingStatesByAnchor(readingLedger), [readingLedger])
  const ledgerBlocks = useMemo(() => documentIrToCognitiveBlocks(documentIr), [documentIr])
  const documentLens = useMemo(() => prepareExperimentalReadingData ? buildDocumentLens(content) : [], [content, prepareExperimentalReadingData])
  const recoveryChangeImpact = useMemo(() => recoveryCapsule ? getRecoveryDocumentChangeImpact(content, recoveryCapsule) : null, [content, recoveryCapsule])
  const frontMatter = useMemo(() => parseFrontMatter(content), [content])
  const renderedContent = frontMatter?.body ?? content
  const largeDocumentModel = useMemo(() => createLargeDocumentModel(renderedContent), [renderedContent])
  const isLargeDocument = largeDocumentModel.pages.length > 1
  const activeLargePage = largeDocumentModel.pages[Math.min(largePageIndex, largeDocumentModel.pages.length - 1)] ?? largeDocumentModel.pages[0]
  const visibleMarkdown = isLargeDocument ? activeLargePage.markdown : renderedContent
  // GFM keeps its semantic footnotes; this is the reader's keyboard-accessible navigator.
  const footnotes = useMemo(() => parseFootnotes(visibleMarkdown), [visibleMarkdown])

  useEffect(() => {
    if (!isLargeDocument) {
      setLargePageIndex(0)
      pendingLargePageScrollRatio.current = null
      return
    }
    const savedRatio = currentPath
      ? useHistoryStore.getState().history.find((item) => item.path === currentPath)?.scrollPositionRatio ?? 0
      : 0
    const scaled = Math.min(savedRatio, 0.999999) * largeDocumentModel.pages.length
    setLargePageIndex(Math.floor(scaled))
    pendingLargePageScrollRatio.current = scaled - Math.floor(scaled)
  }, [currentPath, isLargeDocument, largeDocumentModel.pages.length])

  const openLargePage = (pageIndex: number, headingId: string | null = null) => {
    if (!isLargeDocument) return
    const nextIndex = Math.max(0, Math.min(largeDocumentModel.pages.length - 1, pageIndex))
    pendingLargeHeadingId.current = headingId
    pendingLargePageScrollRatio.current = headingId ? null : 0
    setLargePageIndex(nextIndex)
    if (currentPath) useHistoryStore.getState().updateScrollPosition(currentPath, nextIndex / largeDocumentModel.pages.length)
  }

  useEffect(() => {
    const openHeading = (event: Event) => {
      if (!isLargeDocument) return
      const id = (event as CustomEvent<{ id?: string }>).detail?.id
      if (!id) return
      const pageIndex = largeDocumentModel.headingPageById.get(id)
      if (pageIndex !== undefined) openLargePage(pageIndex, id)
    }
    window.addEventListener('md-reader:open-heading', openHeading)
    return () => window.removeEventListener('md-reader:open-heading', openHeading)
  }, [currentPath, isLargeDocument, largeDocumentModel])

  useLayoutEffect(() => {
    if (!isLargeDocument) return
    const frame = requestAnimationFrame(() => {
      const container = containerRef.current
      if (!container) return
      const headingId = pendingLargeHeadingId.current
      const savedLocalRatio = pendingLargePageScrollRatio.current
      pendingLargeHeadingId.current = null
      pendingLargePageScrollRatio.current = null
      if (headingId) {
        const target = document.getElementById(headingId)
        if (target) {
          const containerRect = container.getBoundingClientRect()
          container.scrollTop += target.getBoundingClientRect().top - containerRect.top - 16
          return
        }
      }
      if (savedLocalRatio !== null) restoreScrollPosition(container, savedLocalRatio)
      else container.scrollTop = 0
    })
    return () => cancelAnimationFrame(frame)
  }, [isLargeDocument, largePageIndex, restoreScrollPosition, visibleMarkdown])

  useEffect(() => {
    if (compact) {
      setIsReadingSuggestionVisible(false)
      return
    }
    setIsReadingSuggestionVisible(localStorage.getItem(readingSuggestionStorageKey) !== '1')
  }, [compact, readingSuggestionStorageKey])

  const applyAndDismissReadingSuggestion = (preset: Parameters<typeof applyReadingPreset>[0]) => {
    applyReadingPreset(preset)
    localStorage.setItem(readingSuggestionStorageKey, '1')
    setIsReadingSuggestionVisible(false)
    setReaderNotice(`已应用${preset === 'comfortable' ? '舒适' : preset === 'compact' ? '紧凑' : '宽松'}阅读排版。`)
  }

  const dismissReadingSuggestion = () => {
    localStorage.setItem(readingSuggestionStorageKey, '1')
    setIsReadingSuggestionVisible(false)
  }
  const searchCount = useMemo(() => {
    const query = searchQuery.trim()
    if (!query) return 0
    return content.toLocaleLowerCase().split(query.toLocaleLowerCase()).length - 1
  }, [content, searchQuery])
  const liveMirrorOptions = useMemo<LiveMirrorOverlayOptions>(() => ({
    searchQuery,
    annotations: annotations.annotations.map((annotation) => ({ id: annotation.id, anchor: annotation.anchor, label: annotation.note || annotation.kind })),
    warnings: healthReport.diagnostics.map((diagnostic) => ({ id: `health:${diagnostic.id}`, line: diagnostic.line, label: diagnostic.description })),
  }), [annotations.annotations, healthReport.diagnostics, searchQuery])

  // The segmented model retains unchanged source fingerprints across external refreshes.
  // Rendering remains owned by React Markdown; this only refreshes the compact navigator.
  useEffect(() => {
    const update = updateLiveMirrorOverlayIndex(liveMirrorIndexRef.current, analysisContent, liveMirrorOptions)
    liveMirrorIndexRef.current = update.index
    setLiveMirrorOverlays(update.index.overlays)
  }, [analysisContent, liveMirrorOptions])

  // This adds visual marks to the post-render DOM only. A stale sidecar anchor
  // is reported to the reader rather than being guessed or written to Markdown.
  useLayoutEffect(() => {
    if (!ENABLE_ANNOTATION_WORKBENCH) {
      setAnnotationStatuses({})
      return
    }
    const root = markdownContentRef.current
    if (!root) return
    setAnnotationStatuses(applyRenderedAnnotations(root, content, annotations.annotations))
  }, [content, annotations.annotations, renderedContent])

  useEffect(() => {
    let cancelled = false
    setResourceInventory({})
    if (!currentPath || !isTauri() || resourceReferences.length === 0) {
      setResourceInspectionState(!currentPath || !isTauri() ? 'unavailable' : 'verified')
      return () => { cancelled = true }
    }
    setResourceInspectionState('checking')
    void inspectCurrentDocumentResources(currentPath, resourceReferences)
      .then((inventory) => {
        if (cancelled) return
        setResourceInventory(inventory)
        setResourceInspectionState('verified')
      })
      .catch((error) => {
        console.warn('Unable to inspect local document resources:', error)
        if (!cancelled) setResourceInspectionState('unavailable')
      })
    return () => { cancelled = true }
  }, [currentPath, resourceReferences])

  // 图片 URL 转换器：依赖 currentPath，路径变化时重建
  useEffect(() => {
    let cancelled = false
    setResolvedLocalImages({})
    if (!currentPath || !isTauri()) return () => { cancelled = true }
    const references = collectMarkdownImageReferences(content)
    if (!references.length) return () => { cancelled = true }
    void Promise.all(references.map(async (reference) => {
      try {
        const resource = await fileService.readVerifiedLocalImage(currentPath, reference)
        let binary = ''
        for (let offset = 0; offset < resource.bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...resource.bytes.subarray(offset, offset + 0x8000))
        }
        const url = `data:${resource.mimeType};base64,${btoa(binary)}`
        return [reference, url] as const
      } catch {
        return null
      }
    })).then((entries) => {
      if (!cancelled) setResolvedLocalImages(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)))
    })
    return () => {
      cancelled = true
    }
  }, [content, currentPath])

  const transformImageUri = useMemo(() => createImageTransformer(currentPath, resolvedLocalImages), [currentPath, resolvedLocalImages])
  const openLightbox = (src: string, alt: string) => setLightboxImage({ src, alt, reference: transformImageUri.originalFor(src) })
  const openLightboxSource = async () => {
    if (!lightboxImage) return
    if (!isTauri()) {
      setReaderNotice('浏览器预览无法取得本地文件权限；请在桌面版使用“打开原文件”。')
      return
    }
    if (!currentPath) return
    let verifiedInventory = resourceInventory
    if (lightboxImage.reference && !canOpenVerifiedLightboxSource(currentPath, lightboxImage.reference, verifiedInventory)) {
      try {
        const inspected = await inspectCurrentDocumentResources(currentPath, [lightboxImage.reference])
        verifiedInventory = { ...resourceInventory, ...inspected }
        setResourceInventory(verifiedInventory)
      } catch (error) {
        console.warn('Unable to verify the selected local image on demand:', error)
      }
    }
    if (!canOpenVerifiedLightboxSource(currentPath, lightboxImage.reference, verifiedInventory)) {
      setReaderNotice('仅可打开已验证、位于当前 Markdown 文件夹内的本地图片。')
      return
    }
    try {
      await fileService.openVerifiedLocalImage(currentPath, lightboxImage.reference)
    } catch (error) {
      setReaderNotice(`无法打开原图片：${error instanceof Error ? error.message : '系统操作失败'}`)
    }
  }

  // 外链点击处理器
  const onLinkClick = useMemo(() => createLinkClickHandler(), [])

  useEffect(() => {
    setAnnotations(ENABLE_ANNOTATION_WORKBENCH
      ? localStorageAnnotationRepository.load(documentKey)
      : createEmptyDocumentAnnotations(documentKey))
    setCanMigrateAnnotationsToSidecar(false)
    setReadingLedger(ENABLE_EXPERIMENTAL_READING_WORKBENCH
      ? localStorageReadingLedgerRepository?.load(documentKey) ?? null
      : null)
    setSelection(null)
    readingStartedAt.current = Date.now()
    setRecoveryCapsule(compact || !canUseReadingRecovery(currentPath, content) ? null : loadRecoveryCapsule(documentKey))
    if (!ENABLE_ANNOTATION_WORKBENCH || !currentPath || !isTauri()) return
    let cancelled = false
    void (async () => {
      try {
        const directory = await fileService.getDirname(currentPath)
        const sidecarPath = await fileService.joinPath(directory, annotationSidecarFileName(currentPath))
        if (!await fileService.exists(sidecarPath)) {
          if (!cancelled) setCanMigrateAnnotationsToSidecar(hasPortableAnnotationData(localStorageAnnotationRepository.load(documentKey)))
          return
        }
        const parsed = parseAnnotationSidecar(await fileService.readTextFile(sidecarPath), documentKey)
        if (!cancelled) {
          setAnnotations(parsed.data)
          localStorageAnnotationRepository.save(parsed.data)
          setCanMigrateAnnotationsToSidecar(parsed.migratedFrom === 1)
        }
      } catch (error) {
        console.warn('Unable to load annotation sidecar:', error)
        if (!cancelled) setReaderNotice('批注侧车无法读取，已保留本地批注。')
      }
    })()
    return () => { cancelled = true }
  }, [compact, documentKey])

  // A baseline belongs to one opened document.  Keeping it only in component
  // state avoids accidental reuse after navigation and never changes tab state.
  useEffect(() => {
    setDiffSource(null)
    setIsDiffOpen(false)
    setIsDiffLoading(false)
    setProjectReport(null)
    setProjectScanTruncated(false)
    setProjectScanState(isTauri() ? 'idle' : 'unavailable')
  }, [currentPath])

  const anchorForText = (text: string, fallbackType = 'paragraph'): BlockAnchor => {
    const normalized = text.replace(/\s+/g, ' ').trim()
    const block = ledgerBlocks.find(({ text: source }) => {
      const candidate = source.replace(/\s+/g, ' ').trim()
      return candidate === normalized || candidate.includes(normalized) || normalized.includes(candidate)
    })
    return block?.anchor ?? {
      id: `block-${fingerprint(`${fallbackType}|${normalized}`)}`,
      contentFingerprint: fingerprint(normalized),
      headingPath: [],
      blockType: fallbackType,
    }
  }

  const persistReadingState = (state: ReadingUnderstandingState, anchor: BlockAnchor) => {
    if (!readingLedger || !localStorageReadingLedgerRepository) {
      setReaderNotice('当前环境无法保存本地阅读账本。')
      return
    }
    const next = recordReadingState(readingLedger, { anchor, state, purpose: routePurpose })
    localStorageReadingLedgerRepository.save(next)
    setReadingLedger(next)
    const labels: Record<ReadingUnderstandingState, string> = { understood: '已理解', questioned: '存疑', skipped: '暂跳过', disagreed: '不同意' }
    setReaderNotice(`已将当前阅读判断记为“${labels[state]}”。仅保存在本机，不会修改原文。`)
  }

  const markSelectionReadingState = (state: ReadingUnderstandingState) => {
    if (!selection) return
    persistReadingState(state, anchorForText(selection.text, 'selection'))
    clearSelection()
  }

  const markCurrentBlockReadingState = (state: ReadingUnderstandingState) => {
    const container = containerRef.current
    if (!container) return
    const midline = container.getBoundingClientRect().top + container.clientHeight / 2
    const candidates = [...container.querySelectorAll<HTMLElement>('p, li, pre, blockquote, td')]
      .filter((element) => (element.innerText || element.textContent || '').trim())
    const target = candidates.reduce<HTMLElement | null>((closest, element) => {
      if (!closest) return element
      return Math.abs(element.getBoundingClientRect().top - midline) < Math.abs(closest.getBoundingClientRect().top - midline) ? element : closest
    }, null)
    if (!target) {
      setReaderNotice('当前阅读区域没有可标记的文本块。')
      return
    }
    persistReadingState(state, anchorForText(target.innerText || target.textContent || '', target.tagName.toLowerCase()))
  }

  useEffect(() => () => {
    if (compact || !canUseReadingRecovery(currentPath, content)) return
    const container = containerRef.current
    const authoredDocument = markdownContentRef.current
    const maxScroll = (container?.scrollHeight ?? 0) - (container?.clientHeight ?? 0)
    const scrollRatio = maxScroll > 0 && container ? container.scrollTop / maxScroll : 0
    const renderedBlocks = authoredDocument
      ? [...authoredDocument.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table')]
        .filter((element) => (element.innerText || element.textContent || '').trim())
      : []
    const readingLine = container ? container.getBoundingClientRect().top + Math.min(160, container.clientHeight * 0.3) : 0
    const anchorIndex = renderedBlocks.reduce((bestIndex, element, index) => {
      if (bestIndex < 0) return index
      return Math.abs(element.getBoundingClientRect().top - readingLine)
        < Math.abs(renderedBlocks[bestIndex].getBoundingClientRect().top - readingLine) ? index : bestIndex
    }, -1)
    const anchor = anchorIndex >= 0 ? renderedBlocks[anchorIndex] : null
    const heading = anchorIndex >= 0
      ? renderedBlocks.slice(0, anchorIndex + 1).reverse().find((element) => /^H[1-6]$/.test(element.tagName))
      : null
    saveRecoveryCapsule(createRecoveryCapsule({
      documentKey, markdown: content, scrollRatio, durationMs: Date.now() - readingStartedAt.current,
      anchorHeading: heading?.innerText || heading?.textContent || null,
      anchorText: anchor?.innerText || anchor?.textContent || null,
      layout: useLayoutStore.getState(), readingPurpose: routePurpose,
      understandingEntries: (readingLedger?.entries ?? []).map((entry) => ({ state: entry.state, headingPath: entry.anchor.headingPath, note: entry.note, workflowState: entry.workflowState, updatedAt: entry.updatedAt })),
    }))
  }, [compact, documentKey, content, readingLedger, routePurpose])

  useEffect(() => {
    if (!readerNotice) return
    const timer = window.setTimeout(() => setReaderNotice(null), 4200)
    return () => window.clearTimeout(timer)
  }, [readerNotice])

  const persistAnnotations = (next: DocumentAnnotations) => {
    setAnnotations(next)
    localStorageAnnotationRepository.save(next)
    if (!currentPath || !isTauri()) return
    void (async () => {
      try {
        const directory = await fileService.getDirname(currentPath)
        const sidecarPath = await fileService.joinPath(directory, annotationSidecarFileName(currentPath))
        await fileService.writeTextFile(sidecarPath, serializeAnnotationSidecar(next))
        setCanMigrateAnnotationsToSidecar(false)
      } catch (error) {
        console.warn('Unable to save annotation sidecar:', error)
        setReaderNotice('批注仅保存在本地浏览器存储；侧车写入失败。')
      }
    })()
  }

  const migrateAnnotationsToSidecar = () => {
    if (!currentPath || !isTauri() || !hasPortableAnnotationData(annotations)) return
    void (async () => {
      try {
        const directory = await fileService.getDirname(currentPath)
        const sidecarPath = await fileService.joinPath(directory, annotationSidecarFileName(currentPath))
        await fileService.writeTextFile(sidecarPath, serializeAnnotationSidecar(annotations))
        setCanMigrateAnnotationsToSidecar(false)
        setReaderNotice('批注已迁移为同目录 .mdreader.json；Markdown 原文未修改。')
      } catch (error) {
        console.warn('Unable to migrate annotation sidecar:', error)
        setReaderNotice('批注侧车迁移失败；本机批注已保留。')
      }
    })()
  }

  const captureSelection = () => {
    const nativeSelection = window.getSelection()
    const text = nativeSelection?.toString().trim() ?? ''
    if (!text || !containerRef.current?.contains(nativeSelection?.anchorNode ?? null)) return setSelection(null)
    const start = content.indexOf(text)
    if (start < 0) return setSelection(null)
    const range = nativeSelection!.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setSelection({ anchor: createTextAnchor(content, start, start + text.length), text, x: rect.left + rect.width / 2, y: rect.bottom + 8 })
  }

  const clearSelection = () => {
    window.getSelection()?.removeAllRanges()
    setSelection(null)
  }

  const addSelectedAnnotation = () => {
    if (!selection) return
    persistAnnotations(addAnnotation(annotations, 'highlight', selection.anchor))
    setIsAnnotationTrayOpen(true)
    setIsReaderToolsOpen(false)
    setIsFocusControlsOpen(false)
    setIsLayoutControlsOpen(false)
    clearSelection()
  }

  const addSelectedExcerpt = () => {
    if (!selection) return
    persistAnnotations(addExcerpt(annotations, selection.text, selection.anchor))
    setIsAnnotationTrayOpen(true)
    setIsReaderToolsOpen(false)
    setIsFocusControlsOpen(false)
    setIsLayoutControlsOpen(false)
    clearSelection()
  }

  const navigateExcerpt = (excerpt: Excerpt) => {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
    const quote = normalize(excerpt.anchor.quote || excerpt.content)
    const target = quote ? [...(containerRef.current?.querySelectorAll<HTMLElement>('p, li, pre, blockquote, td') ?? [])]
      .find((element) => normalize(element.innerText || element.textContent || '').includes(quote)) : undefined
    if (!target) {
      setReaderNotice('未能定位摘录的原文；内容可能已在渲染后变化。')
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('ring-2', 'ring-[var(--accent)]')
    window.setTimeout(() => target.classList.remove('ring-2', 'ring-[var(--accent)]'), 1600)
  }

  const navigateAnnotation = (annotation: Annotation) => {
    const target = findRenderedAnnotation(markdownContentRef.current, annotation.id)
    if (!target) {
      setReaderNotice('未能定位批注原文；批注已安全保留，未修改 Markdown。')
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.focus({ preventScroll: true })
  }

  const exportAnnotationMarkdown = () => {
    const documentTitle = currentPath?.split(/[\\/]/).pop()?.replace(/\.md(?:own)?$/i, '') || '未命名文档'
    const markdown = reviewExportMarkdown({ documentTitle, annotations: annotations.annotations, excerpts: annotations.excerpts })
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${documentTitle}-审阅摘录.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportAnnotationDocx = async () => {
    const documentTitle = currentPath?.split(/[\\/]/).pop()?.replace(/\.md(?:own)?$/i, '') || '未命名文档'
    try {
      const [{ markdownToDocumentIR }, { downloadDocx }] = await Promise.all([
        import('../export/markdownToIr'),
        import('../export/docxExport'),
      ])
      await downloadDocx(markdownToDocumentIR(content), `${documentTitle}-审阅版.docx`, {
        reviewAppendix: { documentTitle, annotations: annotations.annotations, excerpts: annotations.excerpts },
        sourcePath: currentPath ?? undefined,
      })
      setReaderNotice('已导出包含原文与审阅附录的 DOCX；原始 Markdown 和 sidecar 未被修改。')
    } catch (error) {
      console.error('导出审阅 DOCX 失败:', error)
      setReaderNotice('审阅 DOCX 导出失败；原始 Markdown 和 sidecar 未被修改。')
    }
  }

  // Open only after the new Markdown has painted.  Restoring against the prior
  // document's scroll height can land a newly opened document in blank space;
  // a TOC click then appears to "wake" the otherwise already-rendered body.
  useEffect(() => {
    if (isLargeDocument) return
    if (!currentPath || !content.trim()) return
    const found = useHistoryStore.getState().history.find((item) => item.path === currentPath)
    if (!found || found.scrollPositionRatio <= 0) return
    let firstFrame = 0
    let secondFrame = 0
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const container = containerRef.current
        const rendered = markdownContentRef.current
        if (!container || !rendered?.childElementCount) return
        restoreScrollPosition(container, found.scrollPositionRatio)
        requestAnimationFrame(() => {
          const visibleBody = [...rendered.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, table')]
            .some((element) => {
              const rect = element.getBoundingClientRect()
              const viewport = container.getBoundingClientRect()
              return rect.bottom > viewport.top && rect.top < viewport.bottom
            })
          if (!visibleBody) container.scrollTop = 0
        })
      })
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [content, currentPath, isLargeDocument, restoreScrollPosition])

  useEffect(() => {
    const openSearch = () => {
      setIsSearchOpen(true)
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    }
    window.addEventListener('md-reader:find', openSearch)
    return () => window.removeEventListener('md-reader:find', openSearch)
  }, [])

  useEffect(() => {
    const focusDocument = (event: KeyboardEvent) => {
      if (event.key !== 'F6') return
      event.preventDefault()
      containerRef.current?.focus()
    }
    window.addEventListener('keydown', focusDocument)
    return () => window.removeEventListener('keydown', focusDocument)
  }, [])

  useEffect(() => {
    const capture = () => {
      if (containerRef.current) pendingViewportAnchor.current = captureViewportAnchor(containerRef.current)
    }
    window.addEventListener('md-reader:before-external-refresh', capture)
    return () => window.removeEventListener('md-reader:before-external-refresh', capture)
  }, [])

  useLayoutEffect(() => {
    const anchor = pendingViewportAnchor.current
    if (!anchor || !containerRef.current) return
    pendingViewportAnchor.current = null
    requestAnimationFrame(() => {
      if (containerRef.current && !restoreViewportAnchor(containerRef.current, anchor)) {
        setReaderNotice('文档已更新；未能匹配原段落，已保留当前阅读区域。')
      }
    })
  }, [content])

  const findNext = () => {
    const browserWindow = window as Window & { find?: (query: string, caseSensitive?: boolean, backwards?: boolean, wrapAround?: boolean) => boolean }
    if (searchQuery.trim()) browserWindow.find?.(searchQuery, false, false, true)
  }

  const openProjectDocument = async (path: string, fragment?: string) => {
    if (!currentPath) {
      setReaderNotice('当前文档尚未保存，无法解析项目内链接。')
      return
    }
    setProjectBackStack((stack) => [...stack, currentPath].slice(-30))
    window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: path }))
    if (fragment) window.setTimeout(() => document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200)
  }

  const scanProjectDocuments = async () => {
    if (!currentPath) return
    if (!isTauri()) {
      setProjectScanState('unavailable')
      return
    }
    setProjectScanState('scanning')
    try {
      const scan = await scanCurrentAuthorizedProject(currentPath)
      if (!scan) {
        setProjectScanState('unavailable')
        return
      }
      const completeScan = includeCurrentProjectDocument(scan, currentPath, content)
      setProjectScanTruncated(completeScan.truncated)
      const resourceInventory = completeScan.truncated ? {} : await inspectScannedProjectResources(completeScan.documents)
      setProjectReport(completeScan.truncated ? null : verifyProjectDocuments(completeScan.documents, { entryPaths: [currentPath], resourceInventory }))
      setProjectScanState('ready')
      setReaderNotice(completeScan.truncated
        ? '项目扫描达到安全上限，未生成不完整的诊断结论。'
        : `已扫描 ${completeScan.documents.length} 篇 Markdown，并生成项目诊断和推荐阅读顺序。`)
    } catch (error) {
      console.warn('Unable to scan authorized project Markdown:', error)
      setProjectReport(null)
      setProjectScanTruncated(false)
      setProjectScanState('failed')
      setReaderNotice('项目扫描失败；未生成诊断结论。')
    }
  }

  const goProjectBack = async () => {
    const path = projectBackStack.at(-1)
    if (!path) return
    window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: path }))
    setProjectBackStack((stack) => stack.slice(0, -1))
  }

  const openRouteSource = (anchorId: string) => {
    const target = [...(containerRef.current?.querySelectorAll<HTMLElement>('p, li, pre, blockquote, td') ?? [])]
      .find((element) => fingerprint(element.innerText || element.textContent || '') === anchorId.replace(/^block-/, ''))
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.classList.add('ring-2', 'ring-[var(--accent)]')
      window.setTimeout(() => target.classList.remove('ring-2', 'ring-[var(--accent)]'), 1600)
    } else setReaderNotice('未能定位该航线节点的原文；内容可能已在渲染后变化。')
  }

  const openLensSource = (item: DocumentLensItem) => {
    const container = containerRef.current
    const normalized = (value: string) => value.replace(/\s+/g, ' ').trim()
    const source = normalized(item.text)
    let target = [...(container?.querySelectorAll<HTMLElement>('p, li, pre, blockquote, td, table') ?? [])]
      .find((element) => normalized(element.innerText || element.textContent || '').includes(source))
    if (!target && item.reason === 'Markdown 表格') {
      const headers = item.text.split(/\r?\n/)[0].split('|').map((value) => value.trim()).filter(Boolean)
      target = [...(container?.querySelectorAll<HTMLElement>('table') ?? [])]
        .find((element) => headers.every((header) => normalized(element.innerText || element.textContent || '').includes(header)))
    }
    if (!target && item.reason === '图表引用') {
      const alt = /!\[([^\]]+)\]/.exec(item.text)?.[1]
      if (alt) target = [...(container?.querySelectorAll<HTMLElement>('img') ?? [])].find((image) => image.getAttribute('alt') === alt)
    }
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      target.classList.add('ring-2', 'ring-[var(--accent)]')
      window.setTimeout(() => target?.classList.remove('ring-2', 'ring-[var(--accent)]'), 1600)
    } else setReaderNotice(`未能定位透镜结果的原文（第 ${item.line} 行）；内容可能已在渲染后变化。`)
  }

  const openLiveMirrorOverlay = (overlay: LiveMirrorOverlay) => {
    const sourceExcerpt = content.slice(overlay.start, overlay.end).replace(/[*_`~#[\]()>-]/g, ' ').replace(/\s+/g, ' ').trim()
    const target = sourceExcerpt ? [...(containerRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, td') ?? [])]
      .find((element) => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').includes(sourceExcerpt)) : undefined
    if (!target) {
      setReaderNotice(`Live Mirror could not locate the rendered source near line ${overlay.line}.`)
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('live-mirror-source-target')
    window.setTimeout(() => target.classList.remove('live-mirror-source-target'), 1600)
  }

  const openLiveMirrorTemporaryWindow = async () => {
    try {
      const result = await openLiveMirrorPreview({
        title: currentPath ? fileService.getFileName(currentPath) : 'Unsaved Markdown',
        markdown: content,
        overlays: liveMirrorOverlays.map(({ id, kind, line, label }) => ({ id, kind, line, label })),
      })
      if (!result) {
        setIsLiveMirrorOpen(true)
        setReaderNotice('Browser preview cannot open a native temporary Live Mirror window; the in-page overlay list remains available.')
        return
      }
      setReaderNotice(result.reused_window ? 'Live Mirror temporary window refreshed.' : 'Live Mirror opened in a temporary read-only window.')
    } catch (error) {
      setReaderNotice(`Live Mirror could not open: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  const loadDiskDiffSource = async () => {
    if (!canReadDiskRevision(currentPath, isTauri()) || !currentPath) {
      setReaderNotice('浏览器预览没有可重新读取的磁盘版本；请使用“选择本地 Markdown”并在本次会话中授权文件。')
      return
    }
    const targetPath = currentPath
    setIsDiffLoading(true)
    try {
      const markdown = await fileService.readTextFile(targetPath)
      if (useFileStore.getState().currentPath !== targetPath) return
      setDiffSource(makeDiskDiffSource(targetPath, markdown, fileService.getFileName(targetPath)))
      setIsDiffOpen(true)
    } catch (error) {
      console.warn('Unable to load disk revision for comparison:', error)
      setReaderNotice('未能读取磁盘版本；当前内容和文件均未被修改。')
    } finally {
      if (useFileStore.getState().currentPath === targetPath) setIsDiffLoading(false)
    }
  }

  const loadLastSavedDiffSource = () => {
    if (lastSavedContent === null || !canUseLastSavedRevision(lastSavedContent, content)) {
      setReaderNotice('当前内容与上次成功保存的版本一致，尚无可供比较的本地改动。')
      return
    }
    setDiffSource(makeLastSavedDiffSource(lastSavedContent, currentPath ? fileService.getFileName(currentPath) : '未命名文档'))
    setIsDiffOpen(true)
  }

  const pickDiffSource = async () => {
    setIsDiffLoading(true)
    try {
      const path = await fileService.openFileDialog()
      if (!path) return
      const markdown = await fileService.readTextFile(path)
      setDiffSource(makePickedFileDiffSource(path, markdown, fileService.getFileName(path)))
      setIsDiffOpen(true)
    } catch (error) {
      console.warn('Unable to read selected diff source:', error)
      setReaderNotice('未能读取所选 Markdown 文件；比较没有修改任何文档。')
    } finally {
      setIsDiffLoading(false)
    }
  }

  const openDiffEntry = (entry: CompareEntry) => {
    const currentBlock = currentBlockForDiffEntry(entry)
    const searchText = diffEntrySearchText(entry)
    if (!currentBlock || !searchText) {
      setReaderNotice('该内容仅存在于基线版本，当前阅读器中没有可定位的对应块。')
      return
    }
    const normalized = searchText.slice(0, 180)
    const target = [...(containerRef.current?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, td') ?? [])]
      .find((element) => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim().includes(normalized))
    if (!target) {
      setReaderNotice(`未能定位当前版本的 ${currentBlock.kind}（源行 ${currentBlock.line}）。`)
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    target.classList.add('ring-2', 'ring-[var(--accent)]')
    window.setTimeout(() => target.classList.remove('ring-2', 'ring-[var(--accent)]'), 1600)
  }

  const resumeRecovery = () => {
    const container = containerRef.current
    const authoredDocument = markdownContentRef.current
    if (!container || !authoredDocument || !recoveryCapsule) return
    // Recovery must never leave a target hidden in authored <details> blocks.
    // This reader has no independent heading-collapse model, so reopening all
    // native disclosure blocks is the only truthful "continue reading" action.
    // Only authored Markdown disclosure blocks may be expanded. The reader's
    // own <details> controls (for example local TTS settings) must keep their
    // current state when a reading position is restored.
    expandDisclosureBlocks(authoredDocument)
    const quote = recoveryCapsule.nearbyText.replace(/\s+/g, ' ').trim()
    const target = quote ? [...container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, li, pre, blockquote, td')]
      .find((element) => (element.innerText || element.textContent || '').replace(/\s+/g, ' ').includes(quote)) : null
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    else container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight) * recoveryCapsule.scrollRatio
    setRecoveryCapsule(null)
  }

  const moveToFootnoteElement = (id: string, kind: 'definition' | 'reference') => {
    const prefix = kind === 'definition' ? 'user-content-fn-' : 'user-content-fnref-'
    const target = document.getElementById(`${prefix}${id}`)
    if (!target) {
      setReaderNotice(kind === 'definition'
        ? `The rendered definition for footnote ${id} is unavailable.`
        : `The first rendered reference for footnote ${id} is unavailable.`)
      return
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (target instanceof HTMLElement) {
      if (!target.hasAttribute('tabindex') && target.tabIndex < 0) target.setAttribute('tabindex', '-1')
      target.focus({ preventScroll: true })
    }
  }

  const exportHealthReport = async () => {
    const sourceName = currentPath ? fileService.getFileName(currentPath) : 'unsaved-document.md'
    try {
      const file = await downloadDocumentHealthExport(sourceName, healthReport)
      setReaderNotice(`已导出文档健康报告：${file.path}。报告不包含正文或本地完整路径。`)
    } catch (error) {
      setReaderNotice(`文档健康报告导出失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  return (
    <div
      ref={containerRef}
      onScroll={compact ? undefined : (event) => handleScroll(event, isLargeDocument ? { index: largePageIndex, count: largeDocumentModel.pages.length } : undefined)}
      onMouseUp={ENABLE_ANNOTATION_WORKBENCH ? captureSelection : undefined}
      className={`markdown-view h-full overflow-y-auto px-8 pb-12 select-text${compact ? ' markdown-view--compact pt-4' : ' pt-0'}`}
      {...readerLandmarkAria(currentPath ? fileService.getFileName(currentPath) : 'Markdown document')}
      >
      <ScreenReaderAnnouncer message={readerNotice ?? (isSearchOpen ? searchStatusMessage(searchCount ? 1 : 0, searchCount) : '')} />
      {!compact && <><div className="reader-top-tools" aria-label="阅读控制栏">
        <span className="reader-top-tools__label">阅读</span>
        <div className="reader-top-tools__inline">
          {isFocusControlsOpen && <div className="reader-inline-controls" aria-label="阅读专注控制"><ReadingFocus containerRef={containerRef} markdown={content} /></div>}
          {isLayoutControlsOpen && <div className="reader-inline-controls" aria-label="阅读版式控制">
            <div className="reader-layout-controls" role="group" aria-label="阅读版式">
              <button onClick={() => setLineHeight(lineHeight - 0.1)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">行距−</button>
              <button onClick={() => setLineHeight(lineHeight + 0.1)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">行距+</button>
              <button onClick={() => setContentWidth(contentWidth - 80)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">窄</button>
              <button onClick={() => setContentWidth(contentWidth + 80)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">宽</button>
              <button onClick={() => setLetterSpacing(letterSpacing - 0.005)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">字距−</button>
              <button onClick={() => setLetterSpacing(letterSpacing + 0.005)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">字距+</button>
              <button onClick={() => setParagraphSpacing(paragraphSpacing - 0.1)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">段距−</button>
              <button onClick={() => setParagraphSpacing(paragraphSpacing + 0.1)} className="rounded px-2 py-1 hover:bg-[var(--hover)]">段距+</button>
              <button type="button" onClick={toggleVerticalReading} aria-pressed={isVerticalReading} className="rounded px-2 py-1 hover:bg-[var(--hover)]" title="仅改变当前屏幕排版，不会改写 Markdown；代码和表格保持横排">{isVerticalReading ? '关闭竖排' : '竖排阅读'}</button>
            </div>
          </div>}
        </div>
        <div className="reader-top-tools__actions">
          <button type="button" onClick={() => { setIsFocusControlsOpen((open) => !open); setIsLayoutControlsOpen(false); setIsReaderToolsOpen(false); setIsAnnotationTrayOpen(false) }} aria-expanded={isFocusControlsOpen} className="reader-top-tools__button">专注</button>
          <button type="button" onClick={() => { setIsLayoutControlsOpen((open) => !open); setIsFocusControlsOpen(false); setIsReaderToolsOpen(false); setIsAnnotationTrayOpen(false) }} aria-expanded={isLayoutControlsOpen} className="reader-top-tools__button">版式</button>
          {ENABLE_EXPERIMENTAL_READING_WORKBENCH && <button type="button" onClick={() => { setIsReaderToolsOpen((open) => !open); setIsFocusControlsOpen(false); setIsLayoutControlsOpen(false); setIsAnnotationTrayOpen(false) }} aria-expanded={isReaderToolsOpen} className="reader-top-tools__button">阅读工具</button>}
          {ENABLE_ANNOTATION_WORKBENCH && <button type="button" onClick={() => { setIsAnnotationTrayOpen((open) => !open); setIsFocusControlsOpen(false); setIsLayoutControlsOpen(false); setIsReaderToolsOpen(false) }} aria-expanded={isAnnotationTrayOpen} className="reader-top-tools__button">批注与摘录 ({annotations.annotations.length + annotations.excerpts.length})</button>}
        </div>
      </div>
      <SemanticRibbon content={analysisContent} live={Boolean(currentPath)} overlays={liveMirrorOverlays} onNavigateOverlay={openLiveMirrorOverlay} /></>}
      {ENABLE_EXPERIMENTAL_READING_WORKBENCH && isReaderToolsOpen && <aside className="reader-tools-panel grid gap-3" aria-label="阅读工具面板">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setIsHealthOpen((open) => !open)} aria-expanded={isHealthOpen} className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover)]">文档健康 {healthReport.diagnostics.length ? `(${healthReport.diagnostics.length})` : ''}</button>
          <button type="button" onClick={() => setIsRoamOpen((open) => !open)} aria-expanded={isRoamOpen} className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover)]">项目漫游</button>
          <button type="button" onClick={() => setIsRouteOpen((open) => !open)} aria-expanded={isRouteOpen} className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover)]">认知航线</button>
          <button type="button" onClick={() => setIsLensOpen((open) => !open)} aria-expanded={isLensOpen} className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover)]">文档透镜</button>
          <button type="button" onClick={() => setIsTableStudioOpen((open) => !open)} aria-expanded={isTableStudioOpen} className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover)]">表格工作台</button>
          <button type="button" onClick={() => setIsLiveMirrorOpen((open) => !open)} aria-expanded={isLiveMirrorOpen} className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover)]">Live Mirror {liveMirrorOverlays.length ? `(${liveMirrorOverlays.length})` : ''}</button>
          <button type="button" onClick={() => setIsDiffOpen((open) => !open)} aria-expanded={isDiffOpen} className="rounded px-3 py-1.5 text-sm hover:bg-[var(--hover)]">渲染差异</button>
        </div>
        <ReadingTasks embedded currentDocument={{ path: currentPath, title: currentPath ? fileService.getFileName(currentPath) : '未命名文档' }} tabs={tabs} onOpenDocument={(path) => window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: path }))} />
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--paper)] p-2" role="group" aria-label="标记当前阅读块的理解状态">
          <span className="mr-1 text-xs text-[var(--text-muted)]">当前块（仅本机账本）：</span>
          <button type="button" onClick={() => markCurrentBlockReadingState('understood')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">已理解</button>
          <button type="button" onClick={() => markCurrentBlockReadingState('questioned')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">存疑</button>
          <button type="button" onClick={() => markCurrentBlockReadingState('skipped')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">暂跳过</button>
          <button type="button" onClick={() => markCurrentBlockReadingState('disagreed')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">不同意</button>
          {readingLedger && <span className="ml-1 text-xs text-[var(--text-muted)]">已记 {readingLedger.entries.length} 项</span>}
        </div>
        {isHealthOpen && <>
          <div className="flex justify-end">
            <button type="button" onClick={() => void exportHealthReport()} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--hover)]">导出健康报告 JSON</button>
          </div>
          <p className="text-xs text-[var(--text-muted)]" role="status">
            {resourceInspectionState === 'checking' && '正在后台核对当前文档目录中的相对资源…'}
            {resourceInspectionState === 'verified' && (resourceReferences.length ? '相对资源已按当前文档目录完成受限核对。' : '当前文档没有需要核对的本地相对资源。')}
            {resourceInspectionState === 'unavailable' && '当前环境未提供本地资源核对；相对资源保留为待解析。'}
          </p>
          <DocumentHealthPanel report={healthReport} onSelect={(item) => setReaderNotice(`健康检查定位：第 ${item.line} 行。请在编辑模式中修复。`)} />
        </>}
        {isRoamOpen && (currentPath
          ? <ProjectRoam currentPath={currentPath} markdown={content} backStack={projectBackStack} onOpenDocument={openProjectDocument} onGoBack={goProjectBack} verificationReport={projectReport} scanState={projectScanState} scanTruncated={projectScanTruncated} onScan={() => void scanProjectDocuments()} />
          : <p className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm text-[var(--text-muted)]">保存或从本地打开文档后，可使用项目漫游解析相对 Markdown 链接。</p>)}
        {isRouteOpen && <section className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <label>阅读目的 <select value={routePurpose} onChange={(event) => setRoutePurpose(event.target.value as ReadingPurpose)} className="ml-1 rounded border border-[var(--border)] bg-transparent px-2 py-1"><option value="quick-overview">快速了解</option><option value="execution-decision">判断能否执行</option><option value="follow-steps">按文执行</option><option value="complete-reading">完整阅读</option></select></label>
            <label>时间预算 <select value={routeBudget} onChange={(event) => setRouteBudget((event.target.value === 'full' ? 'full' : Number(event.target.value)) as ReadingBudget)} className="ml-1 rounded border border-[var(--border)] bg-transparent px-2 py-1"><option value="5">5 分钟</option><option value="15">15 分钟</option><option value="full">完整</option></select></label>
          </div>
          <CognitiveRoutePanel route={cognitiveRoute} onOpenSource={openRouteSource} readingStates={routeReadingStates} onRecordReadingState={persistReadingState} />
        </section>}
        {isLensOpen && <DocumentLensPanel items={documentLens} documentLabel={currentPath?.split(/[\\/]/).pop() || '当前文档'} onOpenSource={openLensSource} />}
        {isTableStudioOpen && <TableStudioPanel markdown={content} documentKey={documentKey} documentPath={currentPath} onNotice={setReaderNotice} />}
        {isLiveMirrorOpen && <section className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3" aria-label="Live Mirror">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void openLiveMirrorTemporaryWindow()} className="rounded border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--hover)]">Open temporary mirror window</button>
            <span className="text-xs text-[var(--text-muted)]">Read-only snapshot; closing it never changes this reader.</span>
          </div>
          {!isTauri() && <p className="mb-3 text-xs text-[var(--text-muted)]">Browser preview keeps Live Mirror in this panel and does not emulate a native always-on-top window.</p>}
          <LiveMirrorOverlayLegend overlays={liveMirrorOverlays} onNavigate={openLiveMirrorOverlay} />
        </section>}
        {isDiffOpen && <section className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3" aria-label="本地版本渲染差异">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <button type="button" onClick={loadLastSavedDiffSource} disabled={!canUseLastSavedRevision(lastSavedContent, content) || isDiffLoading} className="rounded border border-[var(--border)] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">当前内容 vs 上次保存版本</button>
            <button type="button" onClick={() => void loadDiskDiffSource()} disabled={!canReadDiskRevision(currentPath, isTauri()) || isDiffLoading} className="rounded border border-[var(--border)] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">{isDiffLoading ? '读取中…' : '当前内容 vs 磁盘版本'}</button>
            <button type="button" onClick={() => void pickDiffSource()} disabled={isDiffLoading} className="rounded border border-[var(--border)] px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-50">选择本地 Markdown</button>
            <span className="text-xs text-[var(--text-muted)]">{isModified ? '右侧为未保存的当前内容。' : '右侧为当前阅读内容。'} 比较只读，不会覆盖或保存文件。</span>
          </div>
          {!isTauri() && <p className="mb-3 text-xs text-[var(--text-muted)]">浏览器预览无法重新读取磁盘版本；可选择本次会话中的本地 Markdown 文件作为基线。</p>}
          {diffSource
            ? <RenderDiffPanel leftMarkdown={diffSource.markdown} rightMarkdown={content} leftLabel={diffSource.label} rightLabel={isModified ? '当前未保存内容' : '当前阅读内容'} onSelectEntry={openDiffEntry} />
            : <p className="rounded-lg bg-[var(--hover)] px-3 py-2 text-sm text-[var(--text-muted)]">选择一个只读基线后，按标题、段落、列表、表格行和代码块比较；点击右侧存在的差异可返回当前阅读位置。</p>}
        </section>}
      </aside>}
      {readerNotice && <p role="status" className="mx-auto mb-4 max-w-[960px] rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm shadow-sm">{readerNotice}</p>}
      {isSearchOpen && (
        <div className="sticky top-0 z-20 mx-auto mb-4 flex max-w-[560px] items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-2 shadow-md">
          <input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') findNext(); if (event.key === 'Escape') setIsSearchOpen(false) }} placeholder="在当前文档中搜索" className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm outline-none" />
          <span className="whitespace-nowrap text-xs text-[var(--text-muted)]">{searchCount} 处</span>
          <button onClick={findNext} className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--hover)]">下一个</button>
          <button onClick={() => setIsSearchOpen(false)} className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]">关闭</button>
        </div>
      )}
      {isLargeDocument && (
        <div className="sticky top-0 z-10 mx-auto mb-4 flex max-w-[960px] flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--paper)] px-3 py-2 text-sm shadow-sm" role="status">
          <span>
            大文件轻量模式：第 {largePageIndex + 1} / {largeDocumentModel.pages.length} 页
            <span className="ml-2 text-xs text-[var(--text-muted)]">仅渲染当前段并简化表格工具，导出仍使用完整原文</span>
          </span>
          <span className="flex items-center gap-2">
            <button type="button" disabled={largePageIndex === 0} onClick={() => openLargePage(largePageIndex - 1)} className="rounded border border-[var(--border)] px-3 py-1 disabled:opacity-40">上一页</button>
            <button type="button" disabled={largePageIndex >= largeDocumentModel.pages.length - 1} onClick={() => openLargePage(largePageIndex + 1)} className="rounded border border-[var(--border)] px-3 py-1 disabled:opacity-40">下一页</button>
          </span>
        </div>
      )}
      <div
        className={`prose mx-auto${isVerticalReading ? ' prose--vertical' : ''}`}
        data-testid={isVerticalReading ? 'vertical-reading-viewport' : undefined}
        aria-describedby={isVerticalReading ? 'vertical-reading-description' : undefined}
        style={{ maxWidth: `${contentWidth}px`, fontFamily, fontSize: `${fontSize}px`, lineHeight, letterSpacing: `${letterSpacing}em`, '--paragraph-spacing': `${paragraphSpacing}em` } as React.CSSProperties}
      >
        {isVerticalReading && <p id="vertical-reading-description" className="sr-only">当前以从右向左的竖排方式显示，仅改变屏幕排版，不修改 Markdown。代码块和表格仍保持横向阅读；可使用“关闭竖排”恢复普通横排。</p>}
        {!compact && canSuggestReadingLayout && isReadingSuggestionVisible && <ReadingPersonality suggestion={readingSuggestion} onApply={applyAndDismissReadingSuggestion} onDismiss={dismissReadingSuggestion} />}
        {!compact && recoveryCapsule && <RecoveryCapsuleCard capsule={recoveryCapsule} remainingPercent={(1 - recoveryCapsule.scrollRatio) * 100} documentChangeMessage={recoveryChangeImpact?.changed ? recoveryChangeImpact.message : undefined} onResume={resumeRecovery} onDismiss={() => { removeRecoveryCapsule(documentKey); setRecoveryCapsule(null) }} />}
        <div className="print-document-content">
          {frontMatter && <FrontMatterSummaryCard summary={frontMatter} />}
          <div ref={markdownContentRef}>
          <ReactMarkdown
          remarkPlugins={remarkPlugins}
          rehypePlugins={rehypePlugins}
          urlTransform={transformImageUri}
          components={{
            a: ({ node, ...props }) => (
              <a
                {...props}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => onLinkClick(e, props.href)}
              />
            ),
            img: ({ src, alt = '', ...props }) => (
              <img
                {...props}
                src={src}
                alt={alt}
                role="button"
                tabIndex={0}
                aria-label={`放大查看图片：${alt || '未命名图片'}`}
                onClick={() => src && openLightbox(src, alt)}
                onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && src) { event.preventDefault(); openLightbox(src, alt) } }}
              />
            ),
            pre: ({ children }) => {
              if (!isValidElement<{ className?: string; children?: React.ReactNode }>(children)) return <pre>{children}</pre>
              const className = children.props.className
              const code = String(children.props.children).replace(/\n$/, '')
              if (className?.includes('language-mermaid')) return <MermaidDiagram chart={code} />
              return <CodeBlock className={className} code={code} />
            },
            table: ({ children, ...props }) => isLargeDocument || compact
              ? <div className="max-w-full overflow-x-auto"><table {...props}>{children}</table></div>
              : <TableView {...props}>{children}</TableView>,
            aside: ({ node: _node, ...props }) => <CalloutAside {...props} />,
          }}
        >
          {visibleMarkdown || '*空空如也，请打开一个 Markdown 文件开始阅读*'}
          </ReactMarkdown>
          </div>
          <FootnoteList
            footnotes={footnotes}
            onOpenSource={(footnote) => moveToFootnoteElement(footnote.id, 'definition')}
            onReturnToReference={(footnote) => moveToFootnoteElement(footnote.id, 'reference')}
          />
        </div>
      </div>
      {lightboxImage && <ImageLightbox src={lightboxImage.src} alt={lightboxImage.alt} onClose={() => setLightboxImage(null)} onOpenSource={openLightboxSource} />}
      {ENABLE_ANNOTATION_WORKBENCH && selection && <div className="fixed z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--paper)] p-1 shadow-lg" style={{ left: selection.x, top: selection.y }} role="toolbar" aria-label="选中文本操作"><button type="button" onClick={addSelectedAnnotation} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">高亮批注</button><button type="button" onClick={addSelectedExcerpt} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">摘录</button><span className="self-center px-1 text-xs text-[var(--text-muted)]">账本：</span><button type="button" onClick={() => markSelectionReadingState('understood')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">已理解</button><button type="button" onClick={() => markSelectionReadingState('questioned')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">存疑</button><button type="button" onClick={() => markSelectionReadingState('skipped')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">跳过</button><button type="button" onClick={() => markSelectionReadingState('disagreed')} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">不同意</button><button type="button" onClick={clearSelection} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">取消</button></div>}
      {ENABLE_ANNOTATION_WORKBENCH && isAnnotationTrayOpen && <aside className="annotation-tools-panel">
        <AnnotationTray data={annotations} open onToggle={() => setIsAnnotationTrayOpen(false)} onRemoveAnnotation={(id) => persistAnnotations(removeAnnotation(annotations, id))} onRemoveExcerpt={(id) => persistAnnotations(removeExcerpt(annotations, id))} onReorderExcerpts={(activeId, targetId) => persistAnnotations({ ...annotations, excerpts: reorderExcerpts(annotations.excerpts, activeId, targetId), updatedAt: Date.now() })} onExport={exportAnnotationMarkdown} onExportDocx={() => void exportAnnotationDocx()} onNavigateExcerpt={navigateExcerpt} onNavigateAnnotation={navigateAnnotation} annotationStatuses={annotationStatuses} onMigrateToSidecar={canMigrateAnnotationsToSidecar ? migrateAnnotationsToSidecar : undefined} />
        <AnnotationWorkbench data={annotations} selectedAnchor={selection?.anchor} onChange={persistAnnotations} />
      </aside>}
    </div>
  )
}
