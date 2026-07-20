import { useCallback, useState } from 'react'
import { UnsavedChangesDialog } from '../components/UnsavedChangesDialog'
import { useFileStore } from '../store/useFileStore'
import { showNotice } from '../services/noticeService'

type PendingAction = () => void | Promise<void>

/** 为会替换当前文档的操作提供“保存 / 放弃 / 取消”保护。 */
export function useUnsavedChangesGuard(saveCurrent: () => Promise<boolean>) {
  const isModified = useFileStore((state) => state.isModified)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const runOrConfirm = useCallback((action: PendingAction) => {
    if (isModified) {
      setPendingAction(() => action)
      return
    }
    void action()
  }, [isModified])

  const close = useCallback(() => setPendingAction(null), [])

  const discard = useCallback(() => {
    const action = pendingAction
    close()
    if (action) void action()
  }, [close, pendingAction])

  const saveAndContinue = useCallback(async () => {
    setIsSaving(true)
    try {
      const saved = await saveCurrent()
      if (!saved) return
      const action = pendingAction
      close()
      if (action) await action()
    } catch (error) {
      console.error('保存并继续失败:', error)
      showNotice('保存失败：请检查文件路径和权限后重试。', 'error')
    } finally {
      setIsSaving(false)
    }
  }, [close, pendingAction, saveCurrent])

  const dialog = (
    <UnsavedChangesDialog
      open={pendingAction !== null}
      isSaving={isSaving}
      onCancel={close}
      onDiscard={discard}
      onSave={() => void saveAndContinue()}
    />
  )

  return { runOrConfirm, dialog }
}
