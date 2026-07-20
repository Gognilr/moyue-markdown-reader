import type { ReadingRecoveryCapsule } from '../../types'
import { formatDuration } from '../../features/recovery/recoveryCapsule'

/** Presentational recovery prompt; host owns navigation and dismissal. */
export function RecoveryCapsuleCard({ capsule, remainingPercent, documentChangeMessage, onResume, onDismiss }: { capsule: ReadingRecoveryCapsule; remainingPercent: number; documentChangeMessage?: string; onResume?: () => void; onDismiss?: () => void }) {
  return <section aria-label="上次阅读进度" className="recovery-capsule">
    <div><strong>上次读到{capsule.heading ? `「${capsule.heading}」` : '这里'}</strong><p>停留 {formatDuration(capsule.durationMs)} · 约剩 {Math.max(0, Math.min(100, Math.round(remainingPercent)))}% · {capsule.pendingTaskCount} 个未处理任务</p>
      {capsule.readingPurpose && <p>阅读目的：{purposeLabel(capsule.readingPurpose)}{capsule.lastUnderstanding ? ` · 最后判断：${understandingLabel(capsule.lastUnderstanding.state)}${capsule.lastUnderstanding.heading ? `（${capsule.lastUnderstanding.heading}）` : ''}` : ''}</p>}
      {capsule.unresolvedQuestions.length > 0 && <p>未解问题：{capsule.unresolvedQuestions.join('；')}</p>}
      {documentChangeMessage && <p role="status">{documentChangeMessage}</p>}</div>
    <div className="recovery-capsule__actions"><button type="button" onClick={onResume}>继续阅读</button><button type="button" onClick={onDismiss}>稍后</button></div>
  </section>
}

function purposeLabel(purpose: NonNullable<ReadingRecoveryCapsule['readingPurpose']>): string { return ({ 'quick-overview': '快速了解', 'execution-decision': '判断能否执行', 'follow-steps': '按文执行', 'complete-reading': '完整阅读' })[purpose] }
function understandingLabel(state: NonNullable<ReadingRecoveryCapsule['lastUnderstanding']>['state']): string { return ({ understood: '已理解', questioned: '存疑', skipped: '暂跳过', disagreed: '不同意' })[state] }
