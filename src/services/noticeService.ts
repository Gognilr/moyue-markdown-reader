export type NoticeLevel = 'error' | 'info' | 'success'

export interface AppNotice {
  message: string
  level: NoticeLevel
}

const NOTICE_EVENT = 'md-reader:notice'

export function showNotice(message: string, level: NoticeLevel = 'info'): void {
  window.dispatchEvent(new CustomEvent<AppNotice>(NOTICE_EVENT, { detail: { message, level } }))
}

export { NOTICE_EVENT }
