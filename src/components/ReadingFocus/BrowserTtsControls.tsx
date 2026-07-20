import { useEffect, useMemo, useState } from 'react'
import { createBrowserTtsEngine, markdownToSpeechText, type TtsSkipOptions } from '../../features/reading-focus/tts'

type BrowserTtsControlsProps = {
  markdown: string
}

const defaultOptions: Required<TtsSkipOptions> = { code: true, links: false, tables: true, describeTables: true }

/** Browser-native speech only. No document text leaves this process. */
export function BrowserTtsControls({ markdown }: BrowserTtsControlsProps) {
  const engine = useMemo(() => createBrowserTtsEngine(), [])
  const [options, setOptions] = useState(defaultOptions)
  const [phase, setPhase] = useState<'idle' | 'speaking' | 'paused'>('idle')

  useEffect(() => () => engine.cancel(), [engine])

  if (engine.availability === 'unavailable') {
    return <span className="reading-focus__unavailable" title="当前浏览器或系统未提供 SpeechSynthesis">朗读不可用</span>
  }

  const speak = () => {
    if (engine.speak(markdownToSpeechText(markdown, options), { lang: 'zh-CN', rate: 1 })) setPhase('speaking')
  }
  const togglePause = () => {
    if (phase === 'speaking') { engine.pause(); setPhase('paused') }
    else { engine.resume(); setPhase('speaking') }
  }
  const update = (key: keyof TtsSkipOptions, value: boolean) => setOptions((current) => ({ ...current, [key]: value }))

  return <details className="reading-focus__tts">
    <summary>朗读</summary>
    <div className="reading-focus__tts-menu" role="group" aria-label="本地朗读设置">
      <p>使用本机语音；内容不会上传。</p>
      <label><input type="checkbox" checked={options.code} onChange={(event) => update('code', event.target.checked)} /> 跳过代码</label>
      <label><input type="checkbox" checked={options.links} onChange={(event) => update('links', event.target.checked)} /> 跳过链接文字</label>
      <label><input type="checkbox" checked={options.tables} onChange={(event) => update('tables', event.target.checked)} /> {options.describeTables ? '概述表格' : '跳过表格'}</label>
      {options.tables && <label><input type="checkbox" checked={options.describeTables} onChange={(event) => update('describeTables', event.target.checked)} /> 表格只读行列和表头</label>}
      <div>
        <button type="button" className="reading-focus__button" onClick={speak}>开始朗读</button>
        {phase !== 'idle' && <button type="button" className="reading-focus__button" onClick={togglePause}>{phase === 'speaking' ? '暂停' : '继续'}</button>}
        {phase !== 'idle' && <button type="button" className="reading-focus__button" onClick={() => { engine.cancel(); setPhase('idle') }}>停止</button>}
      </div>
    </div>
  </details>
}
