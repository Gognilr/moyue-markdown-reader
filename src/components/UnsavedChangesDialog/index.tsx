import { FocusTrap, useModalFocus } from '../Accessibility'

interface UnsavedChangesDialogProps {
  open: boolean
  isSaving: boolean
  onCancel: () => void
  onDiscard: () => void
  onSave?: () => void
  title?: string
  description?: string
  discardLabel?: string
  saveLabel?: string
}

/** 在替换当前文档前明确让用户决定如何处理尚未保存的内容。 */
export function UnsavedChangesDialog({ open, isSaving, onCancel, onDiscard, onSave, title = '尚未保存的修改', description = '继续操作会替换当前内容。请先保存，或确认放弃这些修改。', discardLabel = '放弃修改', saveLabel = '保存并继续' }: UnsavedChangesDialogProps) {
  const dialogRef = useModalFocus<HTMLElement>(open)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation">
      <FocusTrap className="w-full max-w-sm"><section ref={dialogRef}
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
        aria-modal="true"
        role="dialog"
        tabIndex={-1}
        className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-5 shadow-xl"
      >
        <h2 id="unsaved-changes-title" className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        <p id="unsaved-changes-description" className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
          {description}
        </p>
        <div className="mt-5 flex justify-end gap-2 text-sm">
          <button type="button" onClick={onCancel} disabled={isSaving} className="rounded-lg px-3 py-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover)] disabled:opacity-50">
            取消
          </button>
          <button type="button" onClick={onDiscard} disabled={isSaving} className="rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50">
            {discardLabel}
          </button>
          {onSave && <button type="button" onClick={onSave} disabled={isSaving} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 font-medium text-white hover:bg-[var(--accent-hover)] disabled:opacity-50">
            {isSaving ? '正在保存…' : saveLabel}
          </button>}
        </div>
      </section></FocusTrap>
    </div>
  )
}
