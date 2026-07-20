import { useEffect, useMemo, useState } from 'react'
import type { DocumentTab, ReadingTask } from '../../types'
import { addReadingTaskDocuments, createReadingTask, loadReadingTasks, removeReadingTaskDocument, saveReadingTasks, setReadingTaskDocumentCompleted, updateReadingTask } from '../../features/reading-task/readingTaskRepository'
import { localStorageReadingLedgerRepository } from '../../features/reading-ledger/readingLedgerRepository'
import { scopeFromTaskDocuments, summarizeCrossDocumentLedger, type LedgerDocumentScope } from '../../features/reading-ledger/crossDocumentLedger'
import { setReadingWorkflowState, type ReadingWorkflowState } from '../../features/reading-ledger/readingLedger'
import { buildTaskConstellation } from '../../features/reading-task/taskConstellation'

export interface ReadingTasksProps {
  currentDocument: { path: string | null; title: string } | null
  tabs: DocumentTab[]
  onOpenDocument?: (path: string) => void
  embedded?: boolean
}

function taskDocumentFromTab(tab: DocumentTab) {
  return { key: tab.path ?? `tab:${tab.id}`, path: tab.path, title: tab.title }
}

/** A deliberately local, explicit overview of task documents and open tabs. */
function LedgerAcrossDocuments({ task, tabs }: { task: ReadingTask; tabs: DocumentTab[] }) {
  const [revision, setRevision] = useState(0)
  const [isLowConfidenceDismissed, setIsLowConfidenceDismissed] = useState(false)
  const scopes = useMemo<LedgerDocumentScope[]>(() => [
    ...scopeFromTaskDocuments(task.documents),
    ...tabs.map((tab) => ({ key: tab.path ?? `tab:${tab.id}`, title: tab.title, path: tab.path })),
  ], [task.documents, tabs])
  const summary = useMemo(() => {
    const repository = localStorageReadingLedgerRepository
    if (!repository) return null
    const keys = [...new Set(scopes.map((scope) => scope.key))]
    return summarizeCrossDocumentLedger(scopes, keys.map((key) => repository.load(key)))
  }, [scopes, revision])
  const setWorkflow = (documentKey: string, entryId: string, state: ReadingWorkflowState) => {
    const repository = localStorageReadingLedgerRepository
    if (!repository) return
    repository.save(setReadingWorkflowState(repository.load(documentKey), entryId, state))
    setRevision((value) => value + 1)
  }
  if (!summary) return null
  return <section className="rounded-lg border border-[var(--border)] p-2" aria-label="跨文档理解账本">
    <div className="flex items-baseline justify-between gap-2"><strong className="text-xs">跨文档理解账本</strong><span className="text-xs text-[var(--text-muted)]">本地 · 任务与页签</span></div>
    {summary.lowConfidenceMessage && !isLowConfidenceDismissed && <p role="status" className="mt-2 flex gap-2 rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><span className="min-w-0 flex-1">低置信提示：{summary.lowConfidenceMessage}</span><button type="button" className="shrink-0 underline" onClick={() => setIsLowConfidenceDismissed(true)}>关闭</button></p>}
    {summary.entries.length === 0 ? <p className="mt-2 text-xs text-[var(--text-muted)]">所选文档尚无显式账本条目；不会据此自动标记理解。</p> : <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">{summary.entries.map(({ document, entry }) => <li key={`${document.key}:${entry.id}`} className="rounded bg-[var(--hover)] p-2 text-xs"><div className="flex gap-2"><span className="min-w-0 flex-1 truncate font-medium" title={document.path ?? document.title}>{document.title}</span><span className="text-[var(--text-muted)]">{entry.state === 'understood' ? '已理解' : entry.state === 'questioned' ? '存疑' : entry.state === 'skipped' ? '跳过' : '不同意'}</span></div><p className="mt-1 line-clamp-2 text-[var(--text-muted)]">{entry.anchor.headingPath.join(' / ') || entry.anchor.blockType}{entry.note ? `：${entry.note}` : ''}</p><div className="mt-2 flex flex-wrap gap-1"><button type="button" onClick={() => setWorkflow(document.key, entry.id, 'pending-verification')} aria-pressed={entry.workflowState === 'pending-verification'} className={`rounded px-2 py-1 ${entry.workflowState === 'pending-verification' ? 'bg-amber-600 text-white' : 'border border-[var(--border)]'}`}>待验证</button><button type="button" onClick={() => setWorkflow(document.key, entry.id, 'judgement-formed')} aria-pressed={entry.workflowState === 'judgement-formed'} className={`rounded px-2 py-1 ${entry.workflowState === 'judgement-formed' ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)]'}`}>已形成判断</button></div></li>)}</ul>}
    <p className="mt-2 text-xs text-[var(--text-muted)]">仅保存读者点击的状态；不调用 AI、不扫描其他文件、不改动原文。</p>
  </section>
}

function TaskEditor({ task, currentDocument, tabs, onOpenDocument, onChange, onDelete }: {
  task: ReadingTask
  currentDocument: ReadingTasksProps['currentDocument']
  tabs: DocumentTab[]
  onOpenDocument?: (path: string) => void
  onChange: (next: ReadingTask) => void
  onDelete: () => void
}) {
  const completeCount = task.documents.filter((document) => document.completedAt !== null).length
  const constellation = useMemo(() => buildTaskConstellation(task), [task])
  const allTabs = useMemo(() => tabs.map(taskDocumentFromTab), [tabs])
  const addCurrent = () => {
    if (!currentDocument) return
    onChange(addReadingTaskDocuments(task, [{ key: currentDocument.path ?? `current:${currentDocument.title}`, path: currentDocument.path, title: currentDocument.title }]))
  }
  return <section className="space-y-3" aria-label={`阅读任务 ${task.purpose || '未命名'}`}>
    <div className="grid grid-cols-[1fr_86px] gap-2">
      <label className="text-xs text-[var(--text-muted)]">目的<input value={task.purpose} onChange={(event) => onChange(updateReadingTask(task, { purpose: event.target.value }))} placeholder="例如：决定是否执行" className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)]" /></label>
      <label className="text-xs text-[var(--text-muted)]">分钟<input type="number" min="1" max="1440" value={task.budgetMinutes} onChange={(event) => onChange(updateReadingTask(task, { budgetMinutes: Number(event.target.value) }))} className="mt-1 w-full rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)]" /></label>
    </div>
    <label className="block text-xs text-[var(--text-muted)]">期待结果<textarea value={task.expectedResult} onChange={(event) => onChange(updateReadingTask(task, { expectedResult: event.target.value }))} placeholder="例如：形成一条可复核的结论" rows={2} className="mt-1 w-full resize-y rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)]" /></label>
    <div className="rounded-lg border border-[var(--border)] p-2">
      <div className="mb-2 flex items-center justify-between text-xs"><strong>文档集合</strong><span className="text-[var(--text-muted)]">{completeCount}/{task.documents.length} 已完成</span></div>
      <div className="mb-2 flex flex-wrap gap-1"><button type="button" disabled={!currentDocument} onClick={addCurrent} className="rounded bg-[var(--hover)] px-2 py-1 text-xs disabled:opacity-50">加入当前</button><button type="button" disabled={allTabs.length === 0} onClick={() => onChange(addReadingTaskDocuments(task, allTabs))} className="rounded bg-[var(--hover)] px-2 py-1 text-xs disabled:opacity-50">加入全部页签</button></div>
      {task.documents.length === 0 ? <p className="text-xs text-[var(--text-muted)]">尚未加入文档。可从当前阅读页或已打开页签添加。</p> : <ul className="space-y-1">{task.documents.map((document) => <li key={document.key} className="flex items-center gap-2 text-xs"><input aria-label={`完成 ${document.title}`} type="checkbox" checked={document.completedAt !== null} onChange={(event) => onChange(setReadingTaskDocumentCompleted(task, document.key, event.target.checked))} /><button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => document.path && onOpenDocument?.(document.path)} title={document.path ?? document.title}>{document.title}</button><button type="button" className="text-[var(--text-muted)] hover:text-red-600" aria-label={`移除 ${document.title}`} onClick={() => onChange(removeReadingTaskDocument(task, document.key))}>移除</button></li>)}</ul>}
    </div>
    <section className="rounded-lg border border-[var(--border)] p-2" aria-label="任务星座">
      <div className="flex items-center justify-between text-xs"><strong>任务星座</strong><span className="text-[var(--text-muted)]">{constellation.completedCount}/{constellation.totalCount} 来源已读</span></div>
      {constellation.totalCount === 0 ? <p className="mt-2 text-xs text-[var(--text-muted)]">加入文档后，这里只呈现本任务明确选择的来源。</p> : <div className="relative mt-2 h-36 overflow-hidden rounded bg-[var(--hover)]" role="img" aria-label={`任务星座：${constellation.completedCount} 个已完成，共 ${constellation.totalCount} 个来源文档`}>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] px-2 py-1 text-xs text-white">任务</span>
        {constellation.nodes.map((document) => <button type="button" key={document.key} onClick={() => document.path && onOpenDocument?.(document.path)} title={document.path ?? document.title} className={`absolute max-w-20 -translate-x-1/2 -translate-y-1/2 truncate rounded-full border px-2 py-1 text-xs ${document.completed ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100' : 'border-[var(--border)] bg-[var(--paper)]'}`} style={{ left: `${document.x}%`, top: `${document.y}%` }}>{document.completed ? '✓ ' : ''}{document.title}</button>)}
      </div>}
      <p className="mt-2 text-xs text-[var(--text-muted)]">只连接本任务手动加入的文档；点击来源可返回原文。</p>
    </section>
    <LedgerAcrossDocuments task={task} tabs={tabs} />
    <label className="block text-xs text-[var(--text-muted)]">实际结果 / 结论<textarea value={task.result} onChange={(event) => onChange(updateReadingTask(task, { result: event.target.value }))} placeholder="把结果留在本机；不会发送给任何服务。" rows={3} className="mt-1 w-full resize-y rounded border border-[var(--border)] bg-transparent px-2 py-1.5 text-sm text-[var(--text-primary)]" /></label>
    <div className="flex justify-between"><span className="text-xs text-[var(--text-muted)]">本地保存，无需账号</span><button type="button" onClick={onDelete} className="text-xs text-red-700 hover:underline">删除任务</button></div>
  </section>
}

/** Local, account-free workspace deliberately separate from the single-document Cognitive Route. */
export function ReadingTasks({ currentDocument, tabs, onOpenDocument, embedded = false }: ReadingTasksProps) {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<ReadingTask[]>(() => loadReadingTasks())
  const [selectedId, setSelectedId] = useState<string | null>(() => loadReadingTasks()[0]?.id ?? null)
  const selected = tasks.find((task) => task.id === selectedId) ?? null
  useEffect(() => { saveReadingTasks(tasks) }, [tasks])
  const replace = (next: ReadingTask) => setTasks((previous) => previous.map((task) => task.id === next.id ? next : task))
  const create = () => {
    const next = createReadingTask({ purpose: '', budgetMinutes: 15, expectedResult: '' })
    setTasks((previous) => [next, ...previous])
    setSelectedId(next.id)
  }
  return <div className={embedded ? 'w-full' : 'fixed bottom-5 right-5 z-40'}>
    {open && <aside className={embedded ? 'mb-2 max-h-[min(68vh,680px)] w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 shadow-sm' : 'mb-2 max-h-[min(78vh,680px)] w-[min(400px,calc(100vw-2.5rem))] overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--paper)] p-3 shadow-xl'}>
      <header className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">阅读任务</h2><p className="text-xs text-[var(--text-muted)]">目的、时间预算、文档集合与期待结果</p></div><button type="button" onClick={create} className="rounded bg-[var(--accent)] px-2 py-1 text-xs text-white">新建</button></header>
      {tasks.length === 0 ? <div className="rounded-lg bg-[var(--hover)] p-3 text-sm"><p>还没有阅读任务。</p><button type="button" onClick={create} className="mt-2 rounded bg-[var(--accent)] px-2 py-1 text-xs text-white">创建第一个任务</button></div> : <><div className="mb-3 flex gap-1 overflow-x-auto pb-1">{tasks.map((task) => <button type="button" key={task.id} onClick={() => setSelectedId(task.id)} className={`shrink-0 rounded px-2 py-1 text-xs ${task.id === selectedId ? 'bg-[var(--accent)] text-white' : 'bg-[var(--hover)]'}`}>{task.purpose || '未命名任务'}</button>)}</div>{selected && <TaskEditor task={selected} currentDocument={currentDocument} tabs={tabs} onOpenDocument={onOpenDocument} onChange={replace} onDelete={() => { setTasks((previous) => previous.filter((task) => task.id !== selected.id)); setSelectedId(tasks.find((task) => task.id !== selected.id)?.id ?? null) }} />}</>}
    </aside>}
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className={embedded ? 'rounded border border-[var(--border)] bg-[var(--paper)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--hover)]' : 'rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white shadow-lg hover:opacity-90'}>{open ? '关闭阅读任务' : '阅读任务'}</button>
  </div>
}
