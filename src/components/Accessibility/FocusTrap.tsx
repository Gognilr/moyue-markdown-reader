import { type KeyboardEvent, type PropsWithChildren, useRef } from 'react'
import { cycleFocus } from '../../features/accessibility/readerNavigation'

export type FocusTrapProps = PropsWithChildren<{
  active?: boolean
  className?: string
}>

/**
 * Optional dialog/panel wrapper. It traps Tab only while active; focus entry
 * and focus restoration remain host responsibilities because the host owns
 * dialog lifecycle and the invoking control.
 */
export function FocusTrap({ active = true, className, children }: FocusTrapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!active || event.key !== 'Tab' || !containerRef.current) return
    if (cycleFocus(containerRef.current, document.activeElement, event.shiftKey)) event.preventDefault()
  }
  return <div ref={containerRef} className={className} onKeyDown={onKeyDown}>{children}</div>
}
