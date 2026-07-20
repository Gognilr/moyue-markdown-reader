// 目录提取 Hook
// 从 Markdown 源码中解析 H1-H4 标题，生成与 rehype-slug 渲染一致的 id

import { useState, useEffect } from 'react'
import GithubSlugger from 'github-slugger'
import type { TocItem } from '../../types'

/** 去除标题文本中的 Markdown 行内格式标记 */
function stripInlineFormatting(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold**
    .replace(/__(.+?)__/g, '$1')       // __bold__
    .replace(/\*(.+?)\*/g, '$1')       // *italic*
    .replace(/_(.+?)_/g, '$1')         // _italic_
    .replace(/~~(.+?)~~/g, '$1')       // ~~strike~~
    .replace(/`([^`]+?)`/g, '$1')      // `code`
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .trim()
}

export function useToc(markdownContent: string): TocItem[] {
  const [toc, setToc] = useState<TocItem[]>([])

  useEffect(() => {
    const lines = markdownContent.split('\n')
    const items: TocItem[] = []
    // 每次解析创建新的 slugger 实例，保证重复标题追加 -1/-2 的逻辑与 rehype-slug 一致
    const slugger = new GithubSlugger()

    for (const line of lines) {
      // 匹配 ATX 风格标题：# ~ ####（1-4 级）
      const match = line.match(/^(#{1,4})\s+(.+?)\s*#*$/)
      if (match) {
        const level = match[1].length
        const rawText = match[2]
        const text = stripInlineFormatting(rawText)
        const id = slugger.slug(text)
        items.push({ id, text, level })
      }
    }

    setToc(items)
  }, [markdownContent])

  return toc
}
