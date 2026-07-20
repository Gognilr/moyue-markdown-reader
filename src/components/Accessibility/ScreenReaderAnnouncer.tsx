import { useEffect, useState } from 'react'

export type ScreenReaderAnnouncerProps = {
  /** Update this value only for meaningful state changes, such as search movement. */
  message: string
  politeness?: 'polite' | 'assertive'
  className?: string
}

/**
 * A visually-hidden live region. Keep it mounted and pass a new message when a
 * reader-visible state change needs narration; do not use it for every render.
 */
export function ScreenReaderAnnouncer({ message, politeness = 'polite', className }: ScreenReaderAnnouncerProps) {
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    if (!message) return
    const frame = requestAnimationFrame(() => setAnnounced(message))
    return () => cancelAnimationFrame(frame)
  }, [message])

  return <div className={className ?? 'sr-only'} role="status" aria-live={politeness} aria-atomic="true">{announced}</div>
}
