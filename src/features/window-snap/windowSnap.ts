import { isTauri } from '../../services/fileService'

export type WindowSnapSide = 'left' | 'right'

export type WindowSnapResult =
  | { performed: true }
  | { performed: false; reason: 'browser' | 'native-error' }

/**
 * Invoke the narrow native command only from the desktop runtime.  A browser
 * preview deliberately receives a truthful no-op result: CSS cannot move the
 * host browser tab into a Windows screen half.
 */
export async function snapReaderWindow(side: WindowSnapSide): Promise<WindowSnapResult> {
  if (!isTauri()) return { performed: false, reason: 'browser' }

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('snap_window_to_side', { side })
    return { performed: true }
  } catch (error) {
    console.error('Unable to snap reader window:', error)
    return { performed: false, reason: 'native-error' }
  }
}

export function windowSnapNotice(side: WindowSnapSide, result: WindowSnapResult): string {
  if (result.performed) return side === 'left' ? '已贴靠到当前屏幕左半区。' : '已贴靠到当前屏幕右半区。'
  if (result.reason === 'browser') return '浏览器预览无法控制 Windows 窗口位置。'
  return '无法贴靠窗口，请检查 Windows 桌面窗口状态。'
}
