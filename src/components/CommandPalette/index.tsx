import { FocusTrap, useModalFocus } from '../Accessibility'

interface Command {
  label: string
  hint: string
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const dialogRef = useModalFocus<HTMLDivElement>(open)

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[16vh]" role="presentation" onMouseDown={onClose}>
      <FocusTrap className="w-full max-w-lg">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="快速命令" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onClose() } }} onMouseDown={(event) => event.stopPropagation()} className="rounded-xl border border-[var(--border)] bg-[var(--paper)] p-2 shadow-xl outline-none">
        <div className="px-3 pb-2 pt-1 text-xs font-semibold tracking-wide text-[var(--text-muted)]">快速命令</div>
        {commands.map((command) => (
          <button key={command.label} data-autofocus={command === commands[0] || undefined} onClick={() => { command.run(); onClose() }} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm hover:bg-[var(--hover)]">
            <span>{command.label}</span><span className="text-xs text-[var(--text-muted)]">{command.hint}</span>
          </button>
        ))}
      </div>
      </FocusTrap>
    </div>
  )
}
