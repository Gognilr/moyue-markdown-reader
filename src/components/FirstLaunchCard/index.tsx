import { FileUp, FolderOpen, X } from 'lucide-react'

interface FirstLaunchCardProps {
  isDropActive: boolean
  onOpen: () => void
  onDismiss: () => void
}

/** A small empty-state guide; it never claims Windows file association is installed. */
export function FirstLaunchCard({ isDropActive, onOpen, onDismiss }: FirstLaunchCardProps) {
  return (
    <section data-testid="first-launch-card" className="absolute inset-0 z-20 grid place-items-center p-5" aria-label="首次使用说明">
      <div className={`relative w-full max-w-xl rounded-2xl border p-7 shadow-xl transition-colors ${isDropActive ? 'border-[var(--accent)] bg-[var(--hover)]' : 'border-[var(--border)] bg-[var(--paper)]'}`}>
        <button type="button" onClick={onDismiss} className="absolute right-3 top-3 rounded p-1.5 text-[var(--text-muted)] hover:bg-[var(--hover)]" aria-label="关闭首次使用说明" title="关闭说明">
          <X size={16} />
        </button>
        <FileUp className="mb-3 text-[var(--accent)]" size={28} aria-hidden="true" />
        <h1 className="pr-7 text-lg font-semibold">打开一份 Markdown，开始阅读</h1>
        <p className="mt-2 leading-6 text-[var(--text-secondary)]">把 <code>.md</code> 或 <code>.markdown</code> 文件拖到这个窗口，或从文件选择器打开。桌面版也支持由系统把文件路径交给应用；请以你的安装环境实际关联结果为准。</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button data-testid="first-launch-open" type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)]">
            <FolderOpen size={16} /> 选择 Markdown 文件
          </button>
          <button type="button" onClick={onDismiss} className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--hover)]">我知道了</button>
        </div>
        {isDropActive && <p className="mt-4 text-sm font-medium text-[var(--accent)]">松开即可打开 Markdown 文件</p>}
      </div>
    </section>
  )
}
