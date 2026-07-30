// 右侧目录导航栏
// 实时提取 H1-H4 标题，点击平滑滚动跳转，高亮当前激活标题

import { useFileStore } from '../../store/useFileStore'
import { useToc } from '../../features/toc/useToc'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { containedStartScrollTop } from '../../features/scroll/containedScroll'
import { isLargeMarkdown } from '../../features/markdown/largeDocument'

const LARGE_TOC_WINDOW = 180

export function Toc() {
  const { content } = useFileStore()
  const toc = useToc(content)
  const [activeId, setActiveId] = useState<string>('')
  const [tocQuery, setTocQuery] = useState('')
  const isLargeDocument = isLargeMarkdown(content)
  const visibleToc = useMemo(() => {
    if (!isLargeDocument || toc.length <= LARGE_TOC_WINDOW) return toc
    const query = tocQuery.trim().toLocaleLowerCase()
    if (query) return toc.filter((item) => item.text.toLocaleLowerCase().includes(query)).slice(0, LARGE_TOC_WINDOW)
    const activeIndex = Math.max(0, toc.findIndex((item) => item.id === activeId))
    const start = Math.max(0, Math.min(toc.length - LARGE_TOC_WINDOW, activeIndex - Math.floor(LARGE_TOC_WINDOW / 2)))
    return toc.slice(start, start + LARGE_TOC_WINDOW)
  }, [activeId, isLargeDocument, toc, tocQuery])

  // 监听滚动，更新当前激活的标题
  useEffect(() => {
    if (toc.length === 0) return

    const scrollContainer = document.querySelector<HTMLElement>('.markdown-view')
    if (!scrollContainer) return
    let frameId: number | null = null
    const handleScroll = () => {
      // rAF 节流：每帧最多执行一次，避免滚动时反复强制布局造成卡顿
      if (frameId !== null) return
      frameId = requestAnimationFrame(() => {
        frameId = null
        const containerTop = scrollContainer.getBoundingClientRect().top
        const toolbarHeight = scrollContainer.querySelector<HTMLElement>('.reader-top-tools')?.offsetHeight ?? 0
        const readingBoundary = containerTop + toolbarHeight + 14
        const renderedHeadings = scrollContainer.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id], h4[id]')
        let current = renderedHeadings[0]?.id || toc[0]?.id || ''
        for (const el of renderedHeadings) {
          if (el.getBoundingClientRect().top > readingBoundary) break
          current = el.id
        }
        setActiveId(current)
      })
    }

    handleScroll()
    scrollContainer.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      scrollContainer.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [toc])

  const handleHeadingClick = useCallback((id: string) => {
    const el = document.getElementById(id)
    const scrollContainer = document.querySelector<HTMLElement>('.markdown-view')
    if (!el || !scrollContainer) {
      window.dispatchEvent(new CustomEvent('md-reader:open-heading', { detail: { id } }))
      setActiveId(id)
      return
    }
    const containerRect = scrollContainer.getBoundingClientRect()
    const topInset = (scrollContainer.querySelector<HTMLElement>('.reader-top-tools')?.offsetHeight ?? 0) + 14
    scrollContainer.scrollTo({ top: containedStartScrollTop({ currentScrollTop: scrollContainer.scrollTop, clientHeight: scrollContainer.clientHeight, scrollHeight: scrollContainer.scrollHeight, containerTop: containerRect.top, targetTop: el.getBoundingClientRect().top, topInset }), behavior: 'smooth' })
    setActiveId(id)
  }, [])

  return (
    <div className="h-full flex flex-col py-6 px-4">
      <div className="text-xs font-semibold tracking-wider text-[var(--text-muted)] uppercase mb-4 pl-2">
        目录导航
      </div>
      {isLargeDocument && toc.length > LARGE_TOC_WINDOW && (
        <div className="mb-3 space-y-1">
          <input value={tocQuery} onChange={(event) => setTocQuery(event.target.value)} placeholder="筛选目录…" className="w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-xs outline-none" />
          <p className="px-1 text-[11px] text-[var(--text-muted)]">显示 {visibleToc.length} / {toc.length} 项，输入标题可跳转全文</p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto space-y-1">
        {toc.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)] pl-2 italic">无标题</div>
        ) : (
          visibleToc.map((item) => (
            <button
              key={item.id}
              onClick={() => handleHeadingClick(item.id)}
              className={`w-full text-left text-xs py-1.5 px-2 rounded transition-colors duration-150 truncate block ${
                activeId === item.id
                  ? 'text-[var(--accent)] font-medium bg-[rgba(204,120,92,0.08)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--hover)] hover:text-[var(--text-primary)]'
              }`}
              style={{ paddingLeft: `${(item.level - 1) * 12 + 8}px` }}
            >
              {item.text}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
