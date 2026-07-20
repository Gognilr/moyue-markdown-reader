import { useEffect, useRef, useState } from 'react'
import { fileService } from '../../services/fileService'
import { useFileStore } from '../../store/useFileStore'
import {
  closeQuickPreview,
  isQuickPreviewWindow,
  listenForQuickPreviewPath,
  navigateQuickPreview,
  previewSessionKind,
  previewMarkdownPath,
  promoteQuickPreview,
  quickPreviewActionFromKey,
} from './quickPreview'

export interface QuickPreviewRuntimeProps {
  /** Optional host notification; this module never uses blocking browser dialogs. */
  onError?: (message: string) => void
}

/**
 * Mount once near the application root. It is inert in the normal reader and
 * in web development, while the dedicated native window receives its path,
 * loads it into its own Zustand store, and owns Esc/Enter lifecycle handling.
 */
export function QuickPreviewRuntime({ onError }: QuickPreviewRuntimeProps) {
  const [active, setActive] = useState(false)
  const activeRef = useRef(false)

  useEffect(() => {
    let disposed = false
    let unlisten: () => void = () => undefined

    const report = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      onError?.(`Quick preview: ${message}`)
    }

    const load = async (path: string | null) => {
      if (!path || disposed) return
      try {
        const content = await fileService.readTextFile(path)
        if (disposed) return
        // Do not call openDocument: the preview must not write normal-reader
        // history or mutate the main reader's session semantics.
        useFileStore.getState().restoreDocument({ path, content })
      } catch (error) {
        report(error)
      }
    }

    void (async () => {
      const isPreview = await isQuickPreviewWindow()
      if (disposed || !isPreview) return
      // Live Mirror owns this shared native window with an in-memory snapshot.
      // Never load its unrelated path-backed state into the normal reader.
      if (await previewSessionKind() === 'live-mirror') return
      activeRef.current = true
      setActive(true)
      unlisten = await listenForQuickPreviewPath((path) => { void load(path) })
      // Read state as well as listening: an open event may have been emitted
      // before the WebView frontend finished booting.
      await load(await previewMarkdownPath())
    })().catch(report)

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return
      const action = quickPreviewActionFromKey(event)
      if (action) {
        event.preventDefault()
        void (action === 'close' ? closeQuickPreview() : promoteQuickPreview()).catch(report)
        return
      }
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowLeft') {
        event.preventDefault()
        void navigateQuickPreview(-1).catch(report)
      }
      if (!event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key === 'ArrowRight') {
        event.preventDefault()
        void navigateQuickPreview(1).catch(report)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      disposed = true
      activeRef.current = false
      unlisten()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onError])

  if (!active) return null
  return <p className="quick-preview-hint" role="status">Esc 关闭预览 · Enter 转为普通窗口</p>
}
