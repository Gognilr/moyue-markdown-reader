import { FocusTrap, useModalFocus } from '../Accessibility'

interface RecoveryDialogProps {
  open: boolean
  onRestore: () => void
  onDiscard: () => void
}

export function RecoveryDialog({ open, onRestore, onDiscard }: RecoveryDialogProps) {
  const dialogRef = useModalFocus<HTMLElement>(open)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation">
      <FocusTrap className="w-full max-w-sm"><section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="recovery-title" tabIndex={-1} className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-5 shadow-xl">
        <h2 id="recovery-title" className="text-base font-semibold text-[var(--text-primary)]">发现未保存草稿</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">上次退出时可能有未保存内容。恢复后会以未保存修改的方式打开，不会自动覆盖磁盘文件。</p>
        <div className="mt-5 flex justify-end gap-2 text-sm">
          <button type="button" onClick={onDiscard} className="rounded-lg px-3 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover)]">丢弃草稿</button>
          <button type="button" onClick={onRestore} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:bg-[var(--accent-hover)]">恢复草稿</button>
        </div>
      </section></FocusTrap>
    </div>
  )
}
