// 左侧边栏
// 搜索框 + 收藏列表 + 最近打开列表

import { useHistoryStore } from '../../store/useHistoryStore'
import { useFileStore } from '../../store/useFileStore'
import { fileService } from '../../services/fileService'
import { showNotice } from '../../services/noticeService'
import { useEffect, useRef, useState } from 'react'
import { Search, Star, Clock, FileText, Trash2, Plus } from 'lucide-react'
import { createContentFingerprint } from '../../features/relocation/fileRelocation'
import type { HistoryItem } from '../../types'

type HistoryPathIssue = 'needs-authorization' | 'missing' | 'invalid'

const normalizeFilePath = (value: string) => value
  .replace(/^\\\\\?\\/, '')
  .replace(/\\/g, '/')
  .replace(/\/+$/, '')
  .toLocaleLowerCase()

export function Sidebar() {
  const { history, toggleFavorite, removeItem, relocateItem } = useHistoryStore()
  const currentPath = useFileStore((state) => state.currentPath)
  const [searchQuery, setSearchQuery] = useState('')
  const [missingItem, setMissingItem] = useState<HistoryItem | null>(null)
  const [pathIssue, setPathIssue] = useState<HistoryPathIssue>('missing')
  const [relocationCandidate, setRelocationCandidate] = useState<{ path: string; content: string; fingerprintMatches: boolean } | null>(null)
  /** 悬浮在列表项上时漂浮显示完整文件路径 */
  const [pathTip, setPathTip] = useState<{ path: string; top: number; left: number; maxWidth: number } | null>(null)
  const pathTipTimer = useRef<number | null>(null)

  const showPathTip = (event: React.MouseEvent<HTMLElement>, path: string) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (pathTipTimer.current !== null) window.clearTimeout(pathTipTimer.current)
    pathTipTimer.current = window.setTimeout(() => {
      pathTipTimer.current = null
      setPathTip({
        path,
        top: rect.bottom + 4,
        left: rect.left + 4,
        maxWidth: Math.min(480, Math.max(220, window.innerWidth - rect.left - 24)),
      })
    }, 350)
  }

  const hidePathTip = () => {
    if (pathTipTimer.current !== null) {
      window.clearTimeout(pathTipTimer.current)
      pathTipTimer.current = null
    }
    setPathTip(null)
  }

  useEffect(() => () => {
    if (pathTipTimer.current !== null) window.clearTimeout(pathTipTimer.current)
  }, [])

  const filteredHistory = history.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.path.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const favorites = filteredHistory.filter(item => item.isFavorite)
  const recent = filteredHistory.filter(item => !item.isFavorite)

  /** 打开历史记录中的文件（含失效检测） */
  const handleOpenFile = async (path: string) => {
    try {
      const status = await fileService.inspectMarkdownPath(path)
      if (status === 'authorized') {
        window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: path }))
        return
      }

      const item = history.find((entry) => entry.path === path)
      if (!item) return
      setMissingItem(item)
      setRelocationCandidate(null)
      if (status === 'exists') {
        setPathIssue('needs-authorization')
        showNotice('文件仍在原位置，但没有找到可信的历史授权记录；请重新选择一次。', 'info')
      } else if (status === 'invalid') {
        setPathIssue('invalid')
        showNotice('这条历史记录的路径格式无效，请重新选择原 Markdown 文件。', 'error')
      } else {
        setPathIssue('missing')
        showNotice('原位置没有找到该文件，你可以选择它现在的位置。', 'info')
      }
    } catch (error) {
      console.error('检查历史文件状态失败:', error)
      showNotice('暂时无法确认文件状态，请稍后重试。', 'error')
    }
  }

  const chooseRelocationCandidate = async () => {
    if (!missingItem) return
    try {
      const path = await fileService.openFileDialog()
      if (!path) return
      const content = await fileService.readTextFile(path)
      if (pathIssue === 'needs-authorization'
        && normalizeFilePath(path) === normalizeFilePath(missingItem.path)) {
        window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: path }))
        setMissingItem(null)
        setRelocationCandidate(null)
        showNotice('已重新授权并打开原文件。', 'success')
        return
      }
      const fingerprintMatches = Boolean(missingItem.contentFingerprint
        && createContentFingerprint(content).hash === missingItem.contentFingerprint.hash)
      setRelocationCandidate({ path, content, fingerprintMatches })
    } catch (error) {
      console.error('选择移动后的文件失败:', error)
      showNotice('无法读取所选 Markdown 文件。', 'error')
    }
  }

  const confirmRelocation = () => {
    if (!missingItem || !relocationCandidate) return
    relocateItem(missingItem.path, relocationCandidate.path, { contentFingerprint: createContentFingerprint(relocationCandidate.content) })
    window.dispatchEvent(new CustomEvent<string>('md-reader:open-path', { detail: relocationCandidate.path }))
    setMissingItem(null)
    setRelocationCandidate(null)
    showNotice('已按你的确认重绑历史记录；收藏与阅读位置已保留。', 'success')
  }

  /** 新建空白文档 */
  const handleAddNew = () => {
    window.dispatchEvent(new Event('md-reader:new-document'))
  }

  /** 渲染单个历史条目 */
  const renderItem = (item: typeof history[0]) => (
    <div
      key={item.path}
      onClick={() => handleOpenFile(item.path)}
      onMouseEnter={(event) => showPathTip(event, item.path)}
      onMouseLeave={hidePathTip}
      className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all duration-150 ${
        currentPath === item.path ? 'bg-[rgba(204,120,92,0.12)] border-l-[3px] border-[var(--accent)]' : 'hover:bg-[var(--hover)]'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FileText size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
        <span className="text-xs font-medium text-[var(--text-primary)] truncate">{item.title}</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation()
            toggleFavorite(item.path)
          }}
          className="p-1 hover:bg-[var(--hover)] rounded text-[var(--text-muted)] hover:text-[var(--accent)]"
          title={item.isFavorite ? '取消收藏' : '添加收藏'}
        >
          <Star size={12} className={item.isFavorite ? 'fill-[var(--accent)] text-[var(--accent)]' : ''} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            removeItem(item.path)
          }}
          className="p-1 hover:bg-[var(--hover)] rounded text-[var(--text-muted)] hover:text-red-500"
          title="从历史中移除"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="relative w-[250px] h-full flex flex-col bg-[var(--panel)] border-r border-[var(--border)] py-4 flex-shrink-0 select-none">
      {/* 搜索框 */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="搜索历史与收藏..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--paper)] border border-[var(--border)] rounded-lg py-1.5 pl-9 pr-3 text-sm outline-none transition-all duration-200 focus:border-[var(--accent)] text-[var(--text-primary)]"
          />
        </div>
      </div>

      {/* 新建快捷操作 */}
      <div className="px-4 mb-6 flex gap-2">
        <button
          onClick={handleAddNew}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs bg-[var(--accent)] text-white font-medium hover:bg-[var(--accent-hover)] transition-all"
        >
          <Plus size={14} />
          新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-6" onScroll={hidePathTip}>
        {/* 收藏夹 */}
        <div>
          <div className="flex items-center gap-1 text-[var(--text-muted)] text-xs font-semibold px-2 mb-2 uppercase tracking-wider">
            <Star size={12} className="text-[var(--accent)] fill-[var(--accent)]" />
            收藏文件
          </div>
          <div className="space-y-0.5">
            {favorites.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] italic px-2 py-1">暂无收藏</div>
            ) : (
              favorites.map(renderItem)
            )}
          </div>
        </div>

        {/* 最近打开 */}
        <div>
          <div className="flex items-center gap-1 text-[var(--text-muted)] text-xs font-semibold px-2 mb-2 uppercase tracking-wider">
            <Clock size={12} />
            最近打开
          </div>
          <div className="space-y-0.5">
            {recent.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)] italic px-2 py-1">暂无最近记录</div>
            ) : (
              recent.map(renderItem)
            )}
          </div>
        </div>
      </div>
      {pathTip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 rounded-md border border-[var(--border)] bg-[var(--paper)] px-2 py-1 text-[11px] leading-snug text-[var(--text-secondary)] shadow-lg break-all"
          style={{ top: pathTip.top, left: pathTip.left, maxWidth: pathTip.maxWidth }}
        >
          {pathTip.path}
        </div>
      )}
      {missingItem && <div className="absolute inset-0 z-30 grid place-items-center bg-black/25 p-4" role="dialog" aria-modal="true" aria-label="处理无法直接打开的历史文件">
        <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--paper)] p-4 shadow-xl">
          <h2 className="text-sm font-semibold">{pathIssue === 'needs-authorization'
            ? '文件仍在原位置，需要重新授权'
            : pathIssue === 'invalid' ? '历史记录路径无效' : '原位置没有找到文件'}</h2>
          <p className="mt-2 break-all text-xs text-[var(--text-muted)]">原位置：{missingItem.path}</p>
          {pathIssue === 'needs-authorization' && <p className="mt-2 text-xs text-[var(--text-muted)]">未找到该文件的可信授权记录；重新选择同一文件即可打开，不会修改或移动文件。新版会记住本次授权。</p>}
          {!relocationCandidate ? <button type="button" onClick={() => void chooseRelocationCandidate()} className="mt-4 rounded bg-[var(--accent)] px-3 py-2 text-sm text-white">{pathIssue === 'needs-authorization' ? '选择原文件并授权' : '重新选择 Markdown'}</button> : <>
            <p className="mt-3 break-all text-xs">候选：{relocationCandidate.path}</p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">{relocationCandidate.fingerprintMatches ? '内容指纹匹配。' : '内容指纹不匹配：仍需你明确确认，应用不会自动重绑。'}</p>
            <div className="mt-4 flex gap-2"><button type="button" onClick={confirmRelocation} className="rounded bg-[var(--accent)] px-3 py-2 text-sm text-white">确认重绑</button><button type="button" onClick={() => setRelocationCandidate(null)} className="rounded border border-[var(--border)] px-3 py-2 text-sm">重新选择</button></div>
          </>}
          <button type="button" onClick={() => { setMissingItem(null); setRelocationCandidate(null) }} className="mt-3 text-xs text-[var(--text-muted)]">取消，保留历史记录</button>
        </div>
      </div>}
    </div>
  )
}
