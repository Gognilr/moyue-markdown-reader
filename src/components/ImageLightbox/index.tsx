import { useEffect, useState } from 'react'
import { useModalFocus } from '../Accessibility'
import { cycleFocus } from '../../features/accessibility/readerNavigation'
import { changeImageScale, IMAGE_SCALE, imageScaleLabel } from './imageLightbox'

type ImageLightboxProps = {
  alt: string
  src: string
  onClose: () => void
  /** Host-owned action; this component never assumes file-system permission. */
  onOpenSource?: (src: string) => void | Promise<void>
}

/** 在阅读上下文中放大查看图片，不改变原 Markdown 内容。 */
export function ImageLightbox({ alt, src, onClose, onOpenSource }: ImageLightboxProps) {
  const dialogRef = useModalFocus<HTMLDivElement>(true)
  const [scale, setScale] = useState<number>(IMAGE_SCALE.initial)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === '+' || event.key === '=') setScale((current) => changeImageScale(current, 1))
      if (event.key === '-') setScale((current) => changeImageScale(current, -1))
      if (event.key === '0') setScale(IMAGE_SCALE.initial)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const copyAddress = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(src)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <div ref={dialogRef} className="image-lightbox" role="dialog" aria-modal="true" aria-label={alt || '图片预览'} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === 'Tab' && cycleFocus(event.currentTarget, document.activeElement, event.shiftKey)) event.preventDefault()
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
    }} onClick={onClose}>
      <div className="image-lightbox__controls" onClick={(event) => event.stopPropagation()} aria-label="图片工具">
        <button data-autofocus type="button" onClick={() => setScale((current) => changeImageScale(current, -1))} aria-label="缩小图片">−</button>
        <button type="button" onClick={() => setScale(IMAGE_SCALE.initial)} aria-label="复位图片缩放">{imageScaleLabel(scale)}</button>
        <button type="button" onClick={() => setScale((current) => changeImageScale(current, 1))} aria-label="放大图片">＋</button>
        <button type="button" onClick={copyAddress}>{copyState === 'copied' ? '已复制地址' : copyState === 'failed' ? '无法复制地址' : '复制图片地址'}</button>
        {onOpenSource && <button type="button" onClick={() => void onOpenSource(src)}>打开原文件</button>}
        <button type="button" className="image-lightbox__close" onClick={onClose} aria-label="关闭图片预览">关闭</button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{copyState === 'copied' ? '图片地址已复制' : copyState === 'failed' ? '无法复制图片地址' : `图片缩放 ${imageScaleLabel(scale)}`}</p>
      <img src={src} alt={alt} style={{ transform: `scale(${scale})` }} onClick={(event) => event.stopPropagation()} />
    </div>
  )
}
