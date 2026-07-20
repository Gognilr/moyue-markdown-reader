import { useEffect, useReducer } from 'react'
import { createFocusTimer, focusTimerReducer, formatFocusTime, loadFocusTimer, saveFocusTimer } from '../../features/reading-focus/focusTimer'

/** Optional local-only timer. Host applications choose whether and where to render it. */
export function FocusTimer() {
  const [state, dispatch] = useReducer(focusTimerReducer, undefined, () => typeof window === 'undefined' ? createFocusTimer() : loadFocusTimer())
  useEffect(() => { saveFocusTimer(state) }, [state])
  useEffect(() => {
    if (state.phase !== 'running') return
    const handle = window.setInterval(() => dispatch({ type: 'tick' }), 1000)
    return () => window.clearInterval(handle)
  }, [state.phase])
  const startOrResume = () => dispatch({ type: state.phase === 'paused' ? 'resume' : 'start' })
  return <section className="reading-focus__timer" aria-label="专注计时器">
    <strong>专注 {formatFocusTime(state.remainingSeconds)}</strong>
    <span className="sr-only" aria-live="polite">{state.phase === 'finished' ? '本次专注结束' : ''}</span>
    <div>
      {state.phase === 'running' ? <button type="button" onClick={() => dispatch({ type: 'pause' })}>暂停</button> : <button type="button" onClick={startOrResume}>{state.phase === 'finished' ? '再来一次' : state.phase === 'paused' ? '继续' : '开始'}</button>}
      <button type="button" onClick={() => dispatch({ type: 'reset' })}>重置</button>
    </div>
    <p>只保存在本机；不会上传、打卡或生成压力统计。</p>
  </section>
}
