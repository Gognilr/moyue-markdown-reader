import type { DocumentTypographyPersonality, ReadingLayoutPreset } from '../../types'
import { typographyPersonalities } from '../../features/reading-personality/personalityPreferences'
import { resolvePinnedPersonality } from '../../features/reading-personality/personalityPreferences'
import { readingLayoutPresets } from '../../store/useLayoutStore'
import { useDocumentPersonalityStore } from '../../store/useDocumentPersonalityStore'
import { useLayoutStore } from '../../store/useLayoutStore'

interface TypographyPersonalityPickerProps {
  documentKey?: string | null
  /** Stable classifier, for example technical, minutes, or report. */
  documentKind?: string | null
  className?: string
}

/**
 * Small standalone control for applying a layout or pinning a typography
 * personality. It has no document mutation path: pins are local preferences.
 */
export function TypographyPersonalityPicker({ documentKey, documentKind, className = '' }: TypographyPersonalityPickerProps) {
  const applyReadingPreset = useLayoutStore((state) => state.applyReadingPreset)
  const setLayout = useLayoutStore((state) => state.setLayout)
  const pin = useDocumentPersonalityStore((state) => state.pin)
  const unpin = useDocumentPersonalityStore((state) => state.unpin)
  const pins = useDocumentPersonalityStore((state) => state.pins)
  const active = resolvePinnedPersonality(pins, documentKey, documentKind)
  const target = documentKey ?? documentKind ?? ''
  const scope = documentKey ? 'document' : 'kind'

  const applyPersonality = (id: DocumentTypographyPersonality) => {
    const { id: _id, label: _label, description: _description, preset: _preset, ...layout } = typographyPersonalities[id]
    setLayout(layout)
  }

  return (
    <section className={`rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-sm ${className}`} aria-label="版式与排版人格">
      <div className="mb-2 flex items-center justify-between gap-2"><strong>阅读版式</strong><span className="text-xs text-[var(--text-muted)]">只影响本地显示</span></div>
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="阅读布局预设">
        {(Object.keys(readingLayoutPresets) as ReadingLayoutPreset[]).map((preset) => (
          <button key={preset} type="button" className="rounded border border-[var(--border)] px-2 py-1 hover:border-[var(--accent)]" onClick={() => applyReadingPreset(preset)}>
            {{ comfortable: '舒适', compact: '紧凑', spacious: '宽松' }[preset]}
          </button>
        ))}
      </div>
      <div className="mb-2 flex items-center justify-between gap-2"><strong>文档排版人格</strong>{active && <span className="text-xs text-[var(--accent)]">已固定：{typographyPersonalities[active].label}</span>}</div>
      <div className="grid gap-1 sm:grid-cols-2">
        {(Object.keys(typographyPersonalities) as DocumentTypographyPersonality[]).map((id) => {
          const profile = typographyPersonalities[id]
          return <button key={id} type="button" aria-pressed={active === id} className={`rounded border p-2 text-left hover:border-[var(--accent)] ${active === id ? 'border-[var(--accent)] bg-[var(--hover)]' : 'border-[var(--border)]'}`} onClick={() => applyPersonality(id)} title={profile.description}>
            <span className="block font-medium">{profile.label}</span><span className="block text-xs text-[var(--text-muted)]">{profile.description}</span>
          </button>
        })}
      </div>
      {target && <div className="mt-3 flex flex-wrap gap-1">
        {(Object.keys(typographyPersonalities) as DocumentTypographyPersonality[]).map((id) => (
          <button key={`pin-${id}`} type="button" className="rounded px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--hover)]" onClick={() => pin(scope, target, id)}>固定为{typographyPersonalities[id].label}</button>
        ))}
        {active && <button type="button" className="rounded px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--hover)]" onClick={() => unpin(scope, target)}>取消固定</button>}
      </div>}
    </section>
  )
}
