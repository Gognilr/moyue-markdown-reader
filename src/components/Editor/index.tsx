// Markdown 源码编辑器
// 带行号显示、等宽字体、与阅读区一致的暖色风格

import { useFileStore } from '../../store/useFileStore'
import { findTextMatches, nextTextMatchIndex, type TextSearchMatch } from '../../features/search/searchModel'
import { useEffect, useMemo, useRef, useState } from 'react'

export function Editor() {
  const { content, setContent } = useFileStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1)
  const searchMatches = useMemo(() => findTextMatches(content, searchQuery), [content, searchQuery])

  // 计算行号列表
  const lineNumbers = useMemo(() => {
    const lines = content.split('\n').length
    return Array.from({ length: lines }, (_, i) => i + 1)
  }, [content])

  // 同步行号区与文本区的滚动
  const handleScroll = () => {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  useEffect(() => {
    const openSearch = () => {
      setIsSearchOpen(true)
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    }
    window.addEventListener('md-reader:find', openSearch)
    return () => window.removeEventListener('md-reader:find', openSearch)
  }, [])

  useEffect(() => {
    if (activeMatchIndex >= searchMatches.length) setActiveMatchIndex(-1)
  }, [activeMatchIndex, searchMatches.length])

  const selectMatch = (match: TextSearchMatch | undefined) => {
    if (!match) return
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(match.start, match.end)
    })
  }

  const navigateSearch = (direction: 1 | -1) => {
    if (searchMatches.length === 0) return
    const index = nextTextMatchIndex(searchMatches, activeMatchIndex, direction)
    setActiveMatchIndex(index)
    selectMatch(searchMatches[index])
  }

  const replaceCurrent = () => {
    if (searchMatches.length === 0) return
    const index = activeMatchIndex >= 0 ? activeMatchIndex : 0
    const match = searchMatches[index]
    const nextContent = `${content.slice(0, match.start)}${replaceQuery}${content.slice(match.end)}`
    setContent(nextContent)
    setActiveMatchIndex(-1)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(match.start, match.start + replaceQuery.length)
    })
  }

  const replaceAll = () => {
    if (searchMatches.length === 0) return
    let nextContent = content
    for (const match of [...searchMatches].reverse()) {
      nextContent = `${nextContent.slice(0, match.start)}${replaceQuery}${nextContent.slice(match.end)}`
    }
    setContent(nextContent)
    setActiveMatchIndex(-1)
  }

  // Tab 键插入两个空格而非切换焦点
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newContent = content.substring(0, start) + '  ' + content.substring(end)
      setContent(newContent)
      // 恢复光标位置
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2
      })
    }
  }

  return (
    <div className="relative h-full w-full flex overflow-hidden bg-[var(--paper)]">
      {isSearchOpen && (
        <div className="absolute right-4 top-3 z-20 w-[min(620px,calc(100%-2rem))] rounded-lg border border-[var(--border)] bg-[var(--paper)] p-2 shadow-lg" role="search" aria-label="编辑器搜索和替换">
          <div className="flex items-center gap-2">
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setActiveMatchIndex(-1) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); navigateSearch(event.shiftKey ? -1 : 1) }
                if (event.key === 'Escape') setIsSearchOpen(false)
              }}
              placeholder="在当前文档中搜索"
              aria-label="在当前文档中搜索"
              className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
            />
            <span className="whitespace-nowrap text-xs text-[var(--text-muted)]" aria-live="polite">{searchMatches.length} 处</span>
            <button type="button" onClick={() => navigateSearch(-1)} disabled={!searchMatches.length} className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--hover)] disabled:opacity-40">上一个</button>
            <button type="button" onClick={() => navigateSearch(1)} disabled={!searchMatches.length} className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--hover)] disabled:opacity-40">下一个</button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={replaceQuery}
              onChange={(event) => setReplaceQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') setIsSearchOpen(false) }}
              placeholder="替换为（可留空）"
              aria-label="替换为"
              className="min-w-0 flex-1 rounded border border-[var(--border)] bg-transparent px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
            />
            <button type="button" onClick={replaceCurrent} disabled={!searchMatches.length} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--hover)] disabled:opacity-40">替换</button>
            <button type="button" onClick={replaceAll} disabled={!searchMatches.length} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--hover)] disabled:opacity-40">全部替换</button>
            <button type="button" onClick={() => setIsSearchOpen(false)} className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]">关闭</button>
          </div>
        </div>
      )}
      {/* 行号槽 */}
      <div
        ref={gutterRef}
        className="flex-shrink-0 overflow-hidden py-6 px-3 text-right text-xs leading-[1.6] text-[var(--text-muted)] select-none border-r border-[var(--border)] bg-[var(--panel)]"
        style={{ minWidth: '48px' }}
      >
        {lineNumbers.map(num => (
          <div key={num} className="font-mono">{num}</div>
        ))}
      </div>

      {/* 文本输入区 */}
      <textarea
        data-testid="markdown-editor"
        ref={textareaRef}
        autoFocus
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        className="flex-1 p-6 resize-none outline-none border-none bg-transparent text-[var(--text-primary)] leading-[1.6] text-[15px] placeholder:text-[var(--text-muted)]"
        placeholder="在这里输入 Markdown 内容..."
        spellCheck={false}
        style={{ fontFamily: '"JetBrains Mono", "Cascadia Code", "Consolas", monospace' }}
      />
    </div>
  )
}
