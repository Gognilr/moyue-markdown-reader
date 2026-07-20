import { useMemo } from 'react'
import type { LiveMirrorOverlay } from './overlays'

export interface LiveMirrorOverlayLegendProps {
  overlays: readonly LiveMirrorOverlay[]
  onNavigate?: (overlay: LiveMirrorOverlay) => void
}

const labels: Record<LiveMirrorOverlay['kind'], string> = {
  search: 'Search', annotation: 'Annotation', warning: 'Warning', risk: 'Risk', 'open-task': 'Open task',
}

/** A renderer-independent legend/list that a host can place beside the semantic ribbon. */
export function LiveMirrorOverlayLegend({ overlays, onNavigate }: LiveMirrorOverlayLegendProps) {
  const groups = useMemo(() => Object.entries(labels).map(([kind, label]) => ({
    kind: kind as LiveMirrorOverlay['kind'], label, items: overlays.filter((item) => item.kind === kind),
  })).filter((group) => group.items.length), [overlays])
  if (!groups.length) return null
  return <section className="live-mirror-overlays" aria-label="Live Mirror overlays">
    {groups.map((group) => <div key={group.kind} className={`live-mirror-overlays__group live-mirror-overlays__group--${group.kind}`}>
      <strong>{group.label} ({group.items.length})</strong>
      <div>{group.items.map((item) => <button type="button" key={item.id} onClick={() => onNavigate?.(item)} title={`Line ${item.line}: ${item.label}`}>
        {item.line}: {item.label}
      </button>)}</div>
    </div>)}
  </section>
}
