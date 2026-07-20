import { ChevronLeft, ChevronRight, CornerUpLeft, FolderTree } from 'lucide-react'
import type { ProjectDocumentLink } from '../../types'
import { getProjectBreadcrumbs, getProjectDocumentLinks } from '../../features/project-roam/projectRoam'
import type { ProjectVerificationReport } from '../../features/project-roam/projectVerification'

export interface ProjectRoamProps {
  currentPath: string
  markdown: string
  /** Host-owned stack: add the prior path when a document is opened. */
  backStack?: string[]
  onOpenDocument?: (path: string, fragment?: string) => void
  onGoBack?: () => void
  verificationReport?: ProjectVerificationReport | null
  scanState?: 'idle' | 'scanning' | 'ready' | 'unavailable' | 'failed'
  scanTruncated?: boolean
  onScan?: () => void
  className?: string
}

/** Presentational project-reader navigation. It never indexes folders or persists state. */
export function ProjectRoam({ currentPath, markdown, backStack = [], onOpenDocument, onGoBack, verificationReport, scanState = 'idle', scanTruncated = false, onScan, className = '' }: ProjectRoamProps) {
  const links = getProjectDocumentLinks(markdown, currentPath)
  const breadcrumbs = getProjectBreadcrumbs(currentPath)
  const hasBack = backStack.length > 0
  const open = (link: ProjectDocumentLink) => onOpenDocument?.(link.path, link.fragment)

  return <nav aria-label="Project document navigation" className={`rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 text-sm ${className}`}>
    <div className="flex flex-wrap items-center gap-1 text-[var(--text-muted)]">
      <FolderTree size={15} aria-hidden="true" />
      {breadcrumbs.map((crumb, index) => <span key={crumb.path} className="flex items-center gap-1">
        {index > 0 && <span aria-hidden="true">/</span>}
        {index === breadcrumbs.length - 1 ? <span className="font-medium text-[var(--text)]">{crumb.label}</span> : <span>{crumb.label}</span>}
      </span>)}
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" disabled={!hasBack} onClick={onGoBack} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-40"><CornerUpLeft size={15} />返回</button>
      {links.length > 0 && <>
        <button type="button" onClick={() => open(links[0])} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--hover)]"><ChevronLeft size={15} />上一篇</button>
        <button type="button" onClick={() => open(links[links.length - 1])} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-[var(--hover)]">下一篇<ChevronRight size={15} /></button>
      </>}
    </div>
    {links.length > 0 && <ol className="mt-3 space-y-1 border-t border-[var(--border)] pt-2">
      {links.map((link) => <li key={`${link.path}#${link.fragment ?? ''}`}><button type="button" onClick={() => open(link)} className="w-full rounded px-2 py-1 text-left hover:bg-[var(--hover)]">{link.label}</button></li>)}
    </ol>}
    <section className="mt-3 border-t border-[var(--border)] pt-3" aria-label="项目文档诊断">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-medium text-[var(--text)]">项目诊断与推荐阅读</h3><p className="text-xs text-[var(--text-muted)]">仅扫描当前已打开文档所在目录内的 Markdown 文件。</p></div>
        <button type="button" onClick={onScan} disabled={!onScan || scanState === 'scanning'} className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-50">{scanState === 'scanning' ? '扫描中…' : '扫描项目'}</button>
      </div>
      {scanState === 'unavailable' && <p className="mt-2 text-xs text-[var(--text-muted)]">浏览器预览未获得目录权限；请在桌面版打开本地文档后扫描。</p>}
      {scanState === 'failed' && <p className="mt-2 text-xs text-red-700">项目扫描失败；未将结果用作诊断结论。</p>}
      {scanTruncated && <p className="mt-2 text-xs text-amber-700">项目超出扫描上限，以下结果不代表完整项目，请缩小目录后重试。</p>}
      {verificationReport && !scanTruncated && <>
        <p className="mt-2 text-xs text-[var(--text-muted)]">诊断 {verificationReport.diagnostics.length} 项；阅读顺序 {verificationReport.recommendedReadingOrder.length} 篇。</p>
        {verificationReport.diagnostics.length > 0 && <ul className="mt-2 space-y-1 text-xs" aria-label="项目诊断结果">
          {verificationReport.diagnostics.map((item, index) => <li key={`${item.code}-${item.path}-${item.line}-${index}`} className="rounded bg-[var(--hover)] px-2 py-1"><span className="font-medium">{item.code}</span>：{item.description}</li>)}
        </ul>}
        <ol className="mt-2 space-y-1 text-xs" aria-label="推荐阅读顺序">
          {verificationReport.recommendedReadingOrder.map((item, index) => <li key={item.path}><button type="button" onClick={() => onOpenDocument?.(item.path)} className="rounded px-1 text-left hover:bg-[var(--hover)]">{index + 1}. {item.title} <span className="text-[var(--text-muted)]">({item.reason === 'entry' ? '入口' : item.reason === 'linked-from' ? '由链接到达' : '未关联'})</span></button></li>)}
        </ol>
      </>}
    </section>
  </nav>
}
