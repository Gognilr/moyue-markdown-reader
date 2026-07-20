import { useEffect, useRef, type RefObject } from 'react'

/** Gives a modal a keyboard entry point and restores its invoking focus. */
export function useModalFocus<T extends HTMLElement>(open: boolean): RefObject<T> {
  const dialogRef = useRef<T>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(() => {
      const dialog = dialogRef.current
      if (!dialog) return
      const initial = dialog.querySelector<HTMLElement>('[data-autofocus]')
      ;(initial ?? dialog).focus()
    })
    return () => {
      window.clearTimeout(timer)
      if (previous?.isConnected) previous.focus()
    }
  }, [open])
  return dialogRef
}
