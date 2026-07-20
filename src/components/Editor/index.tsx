// Markdown 源码编辑器
// 带行号显示、等宽字体、与阅读区一致的暖色风格

import { useFileStore } from '../../store/useFileStore'
import { useRef, useMemo } from 'react'

export function Editor() {
  const { content, setContent } = useFileStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

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
    <div className="h-full w-full flex overflow-hidden bg-[var(--paper)]">
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
