import type { ExportPreflightReport } from '../../features/export/exportPreflight'
import type { ExportTemplate } from '../../features/export/exportTemplates'
import { resolutionLabel, type ExportOnlyChoice, type ExportPreflightResolutionState } from '../../features/export/exportPreflightResolution'

const RISK_LABEL = { A: '旧版 A 风险', B: 'B：已记录风险', C: 'C：确定性阻塞' } as const
const GRADE_LABEL = {
  A: 'A：结构性预检通过（非视觉验证）',
  B: 'B：存在已记录的降级或兼容性风险',
  C: 'C：存在未解决的确定性阻塞项',
} as const

export interface ExportPreflightPanelProps {
  report: ExportPreflightReport
  /** The caller-selected DOCX/PDF presentation; it does not modify Markdown. */
  template?: ExportTemplate
  resolutionState?: ExportPreflightResolutionState
  onAutomaticFixChange?: (issueId: string, applied: boolean) => void
  onChoiceChange?: (issueId: string, choice: ExportOnlyChoice) => void
  onExport?: () => void
  exportLabel?: string
  exportDisabled?: boolean
  isExporting?: boolean
  onClose?: () => void
}

/** Standalone presentation component: callers decide where and when it is mounted. */
export function ExportPreflightPanel({ report, template, resolutionState, onAutomaticFixChange, onChoiceChange, onExport, exportLabel = '导出', exportDisabled = false, isExporting = false, onClose }: ExportPreflightPanelProps) {
  return <section aria-label="导出预检" className="rounded-lg border border-[var(--border)] bg-[var(--paper)] p-4 text-sm text-[var(--text-primary)] shadow-lg">
    <header className="mb-3 flex items-start justify-between gap-3">
      <div><h2 className="m-0 text-base font-semibold">导出预检</h2><p className="mt-1 text-xs text-[var(--text-muted)]">{report.canExport ? '没有确定阻塞项，可以继续导出。' : '请先处理确定阻塞项，再开始导出。'}</p></div>
      {onClose && <button type="button" onClick={onClose} className="rounded px-2 py-1 text-xs hover:bg-[var(--hover)]">关闭</button>}
    </header>
    <div className="mb-3 rounded border border-[var(--border)] bg-[var(--hover)] p-2 text-xs text-[var(--text-secondary)]">
      <strong className="text-[var(--text-primary)]">本次导出可信度：{GRADE_LABEL[report.confidence]}</strong>
      <p className="mb-0 mt-1">证据：{report.evidence.join(' ')}</p>
      {report.downgradeReasons.length > 0 && <p className="mb-0 mt-1">降级原因：{report.downgradeReasons.join('；')}</p>}
    </div>
    <div className="mb-3 flex gap-2 text-xs text-[var(--text-muted)]"><span>B 风险 {report.summary.B}</span><span>C 阻塞 {report.summary.C}</span></div>
    {template && <p className="mb-3 rounded border border-[var(--border)] bg-[var(--hover)] p-2 text-xs text-[var(--text-secondary)]">
      将使用“{template.label}”模板：页面 {template.tokens.page.size.toUpperCase()}、正文字号 {template.tokens.typography.bodySizePt}pt、行高 {template.tokens.typography.lineHeight}、主题色 #{template.tokens.colors.accent}；这些 token 仅在 DOCX/PDF 导出时应用，不改写 Markdown。
    </p>}
    {!report.issues.length ? <p className="m-0 text-[var(--text-muted)]">未发现当前规则可识别的导出风险。</p> : <ul className="m-0 space-y-2 p-0">
      {report.issues.map((entry) => <li key={entry.id} className="list-none rounded border border-[var(--border)] p-2">
        <div className="flex items-center justify-between gap-2"><strong>{resolutionState ? resolutionLabel(entry, resolutionState) : entry.disposition === 'autoFixed' ? '已自动修复' : entry.disposition === 'needsChoice' ? '需要选择' : '无法保证'} · {RISK_LABEL[entry.confidence]}</strong><span className="text-xs text-[var(--text-muted)]">{entry.location}</span></div>
        <p className="mb-0 mt-1">{entry.message}</p><p className="mb-0 mt-1 text-xs text-[var(--text-secondary)]">建议：{entry.suggestedFix}</p>
        {resolutionState && entry.disposition === 'autoFixed' && onAutomaticFixChange && <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={resolutionState.appliedAutomaticFixes.includes(entry.id)} onChange={(event) => onAutomaticFixChange(entry.id, event.target.checked)} />仅对本次导出应用；取消即撤销</label>}
        {resolutionState && entry.disposition === 'needsChoice' && onChoiceChange && <fieldset className="mt-2 flex gap-3 border-0 p-0 text-xs text-[var(--text-secondary)]"><legend className="sr-only">导出前选择</legend><label><input type="radio" name={entry.id} checked={resolutionState.choices[entry.id] === 'keep'} onChange={() => onChoiceChange(entry.id, 'keep')} /> 保留</label><label><input type="radio" name={entry.id} checked={resolutionState.choices[entry.id] === 'omit'} onChange={() => onChoiceChange(entry.id, 'omit')} /> 导出副本中省略</label></fieldset>}
      </li>)}
    </ul>}
    {(onExport || onClose) && <footer className="mt-4 flex justify-end gap-2 border-t border-[var(--border)] pt-3">
      {onClose && <button type="button" onClick={onClose} disabled={isExporting} className="rounded border border-[var(--border)] px-3 py-1.5 text-xs hover:bg-[var(--hover)] disabled:opacity-50">取消</button>}
      {onExport && <button type="button" onClick={onExport} disabled={exportDisabled || isExporting} className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-45">{isExporting ? '正在导出…' : exportLabel}</button>}
    </footer>}
  </section>
}
