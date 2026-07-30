import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { AUTO_SCROLL_DEFAULT_SPEED, AUTO_SCROLL_MAX_SPEED, AUTO_SCROLL_MIN_SPEED, clampAutoScrollSpeed, isEditableElement, readingBlockSelector } from './readingFocusUtils'
import { BrowserTtsControls } from './BrowserTtsControls'
import { FocusTimer } from './FocusTimer'
import { containedStartScrollTop, nextBlockIndex } from '../../features/scroll/containedScroll'

type ReadingFocusProps = {
  containerRef: RefObject<HTMLDivElement>
  markdown: string
}

const storageKey = 'md-reader:reading-focus'

type Settings = { rulerEnabled: boolean; autoScrollEnabled: boolean; speed: number }

function loadSettings(): Settings {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as Partial<Settings>
    return { rulerEnabled: value.rulerEnabled ?? true, autoScrollEnabled: false, speed: clampAutoScrollSpeed(value.speed ?? AUTO_SCROLL_DEFAULT_SPEED) }
  } catch {
    return { rulerEnabled: true, autoScrollEnabled: false, speed: AUTO_SCROLL_DEFAULT_SPEED }
  }
}

function visibleTopLevelReadingBlocks(container: HTMLElement): HTMLElement[] {
  const root = container.querySelector<HTMLElement>('.print-document-content')
  if (!root) return []
  const selector = readingBlockSelector()
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((block) => !block.parentElement?.closest(selector))
    .filter((block) => block.getClientRects().length > 0)
}

export function ReadingFocus({ containerRef, markdown }: ReadingFocusProps) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [isPointerPaused, setIsPointerPaused] = useState(false)
  const pauseTimer = useRef<number | null>(null)
  const frame = useRef<number | null>(null)
  const lastTime = useRef<number | null>(null)

  const persist = useCallback((next: Settings) => {
    setSettings(next)
    localStorage.setItem(storageKey, JSON.stringify({ rulerEnabled: next.rulerEnabled, speed: next.speed }))
  }, [])

  const updateRuler = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (!settings.rulerEnabled) {
      container.querySelectorAll('.reading-ruler-current').forEach((node) => node.classList.remove('reading-ruler-current'))
      return
    }
    const blocks = visibleTopLevelReadingBlocks(container)
    const guide = container.getBoundingClientRect().top + container.clientHeight * 0.38
    let current: HTMLElement | undefined
    let closestDistance = Number.POSITIVE_INFINITY
    for (const block of blocks) {
      const rect = block.getBoundingClientRect()
      const distance = rect.top <= guide && rect.bottom >= guide ? 0 : Math.min(Math.abs(rect.top - guide), Math.abs(rect.bottom - guide))
      if (distance < closestDistance) {
        current = block
        closestDistance = distance
      }
    }
    for (const block of blocks) block.classList.toggle('reading-ruler-current', block === current)
  }, [containerRef, settings.rulerEnabled])

  const moveToNextBlock = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const blocks = visibleTopLevelReadingBlocks(container)
    const containerRect = container.getBoundingClientRect()
    const toolbar = container.querySelector<HTMLElement>('.reader-top-tools')
    const topInset = (toolbar?.offsetHeight ?? 0) + 12
    const guideTop = containerRect.top + topInset + Math.max(0, container.clientHeight - topInset) * 0.32
    const index = nextBlockIndex(blocks.map((block) => block.getBoundingClientRect().top), guideTop)
    if (index < 0) return
    const targetRect = blocks[index].getBoundingClientRect()
    container.scrollTo({
      top: containedStartScrollTop({ currentScrollTop: container.scrollTop, clientHeight: container.clientHeight, scrollHeight: container.scrollHeight, containerTop: containerRect.top, targetTop: targetRect.top, topInset }),
      behavior: 'smooth',
    })
  }, [containerRef])

  useEffect(() => {
    updateRuler()
    const container = containerRef.current
    let frameId: number | null = null
    // rAF 节流：每帧最多更新一次标尺，避免滚动时频繁遍历阅读块触发布局计算
    const throttledUpdateRuler = () => {
      if (frameId !== null) return
      frameId = requestAnimationFrame(() => {
        frameId = null
        updateRuler()
      })
    }
    container?.addEventListener('scroll', throttledUpdateRuler, { passive: true })
    window.addEventListener('resize', throttledUpdateRuler)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      container?.removeEventListener('scroll', throttledUpdateRuler)
      window.removeEventListener('resize', throttledUpdateRuler)
      container?.querySelectorAll('.reading-ruler-current').forEach((node) => node.classList.remove('reading-ruler-current'))
    }
  }, [containerRef, updateRuler])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isEditableElement(event.target)) return
      const container = containerRef.current
      if (!container || !document.activeElement || (!container.contains(document.activeElement) && document.activeElement !== document.body)) return
      event.preventDefault()
      moveToNextBlock()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [containerRef, moveToNextBlock])

  useEffect(() => {
    if (!settings.autoScrollEnabled || isPointerPaused) return
    const tick = (now: number) => {
      const container = containerRef.current
      if (container && lastTime.current !== null) {
        const delta = Math.min(now - lastTime.current, 100)
        container.scrollTop += settings.speed * delta / 1000
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 1) {
          persist({ ...settings, autoScrollEnabled: false })
          return
        }
      }
      lastTime.current = now
      frame.current = requestAnimationFrame(tick)
    }
    lastTime.current = null
    frame.current = requestAnimationFrame(tick)
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); frame.current = null }
  }, [containerRef, isPointerPaused, persist, settings])

  const pauseForPointer = () => {
    if (!settings.autoScrollEnabled) return
    setIsPointerPaused(true)
    if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current)
    pauseTimer.current = window.setTimeout(() => setIsPointerPaused(false), 1100)
  }

  useEffect(() => {
    const container = containerRef.current
    container?.addEventListener('mousemove', pauseForPointer, { passive: true })
    return () => container?.removeEventListener('mousemove', pauseForPointer)
  }, [containerRef, settings.autoScrollEnabled])

  useEffect(() => () => { if (pauseTimer.current !== null) window.clearTimeout(pauseTimer.current) }, [])

  return (
    <div className="reading-focus" role="group" aria-label="阅读专注工具">
      <button type="button" className="reading-focus__button" aria-pressed={settings.rulerEnabled} onClick={() => persist({ ...settings, rulerEnabled: !settings.rulerEnabled })} title="突出当前段落">标尺</button>
      <button type="button" className="reading-focus__button" onClick={moveToNextBlock} title="空格键也可逐段推进">下一段</button>
      <button type="button" className="reading-focus__button" aria-pressed={settings.autoScrollEnabled} onClick={() => persist({ ...settings, autoScrollEnabled: !settings.autoScrollEnabled })} title="自动滚动；移动鼠标暂停">{settings.autoScrollEnabled ? '停止滚动' : '自动滚动'}</button>
      <label className="reading-focus__speed">速度
        <input aria-label="自动滚动速度" type="range" min={AUTO_SCROLL_MIN_SPEED} max={AUTO_SCROLL_MAX_SPEED} step="6" value={settings.speed} onChange={(event) => persist({ ...settings, speed: clampAutoScrollSpeed(Number(event.target.value)) })} />
        <output>{settings.speed}px/秒</output>
      </label>
      <BrowserTtsControls markdown={markdown} />
      <FocusTimer />
      <span className="sr-only" aria-live="polite">{isPointerPaused ? '自动滚动已因鼠标移动暂停' : settings.autoScrollEnabled ? '自动滚动中' : ''}</span>
    </div>
  )
}
