import type { ReadingLayoutPreset, ReadingPersonalitySuggestion } from '../../types'
import { readingPresetLabel } from '../../features/reading-personality/readingPersonality'

interface ReadingPersonalityProps {
  suggestion: ReadingPersonalitySuggestion
  onApply: (preset: ReadingLayoutPreset) => void
  onDismiss?: () => void
}

/** Reusable, opt-in presentation for the deterministic reading-personality rule. */
export function ReadingPersonality({ suggestion, onApply, onDismiss }: ReadingPersonalityProps) {
  return (
    <aside className="reading-personality" aria-label="阅读排版建议">
      <div>
        <strong>建议：{readingPresetLabel[suggestion.preset]}阅读</strong>
        <p>{suggestion.reason}</p>
      </div>
      <div className="reading-personality__actions">
        <button type="button" onClick={() => onApply(suggestion.preset)}>应用</button>
        {onDismiss && <button type="button" className="reading-personality__dismiss" onClick={onDismiss}>稍后</button>}
      </div>
    </aside>
  )
}
