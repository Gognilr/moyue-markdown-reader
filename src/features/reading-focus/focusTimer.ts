export type FocusTimerState = {
  phase: 'idle' | 'running' | 'paused' | 'finished'
  durationSeconds: number
  remainingSeconds: number
}

export type FocusTimerAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'tick' }
  | { type: 'reset'; durationSeconds?: number }

export const FOCUS_TIMER_STORAGE_KEY = 'md-reader:focus-timer'

export function createFocusTimer(durationSeconds = 25 * 60): FocusTimerState {
  const duration = Math.max(60, Math.floor(durationSeconds))
  return { phase: 'idle', durationSeconds: duration, remainingSeconds: duration }
}

export function focusTimerReducer(state: FocusTimerState, action: FocusTimerAction): FocusTimerState {
  switch (action.type) {
    case 'start': return state.phase === 'idle' || state.phase === 'finished' ? { ...state, phase: 'running', remainingSeconds: state.phase === 'finished' ? state.durationSeconds : state.remainingSeconds } : state
    case 'pause': return state.phase === 'running' ? { ...state, phase: 'paused' } : state
    case 'resume': return state.phase === 'paused' ? { ...state, phase: 'running' } : state
    case 'tick':
      if (state.phase !== 'running') return state
      return state.remainingSeconds <= 1 ? { ...state, phase: 'finished', remainingSeconds: 0 } : { ...state, remainingSeconds: state.remainingSeconds - 1 }
    case 'reset': return createFocusTimer(action.durationSeconds ?? state.durationSeconds)
  }
}

export function formatFocusTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`
}

export function loadFocusTimer(storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): FocusTimerState {
  try {
    const parsed = JSON.parse(storage?.getItem(FOCUS_TIMER_STORAGE_KEY) ?? '') as Partial<FocusTimerState>
    if (typeof parsed.durationSeconds === 'number' && typeof parsed.remainingSeconds === 'number' && ['idle', 'paused', 'finished'].includes(parsed.phase ?? '')) {
      return { durationSeconds: Math.max(60, parsed.durationSeconds), remainingSeconds: Math.max(0, parsed.remainingSeconds), phase: parsed.phase as FocusTimerState['phase'] }
    }
  } catch { /* a corrupt preference is safely ignored */ }
  return createFocusTimer()
}

export function saveFocusTimer(state: FocusTimerState, storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): void {
  // A running timer is deliberately restored as paused: no background tracking or check-in behavior.
  const stored = { ...state, phase: state.phase === 'running' ? 'paused' : state.phase }
  storage?.setItem(FOCUS_TIMER_STORAGE_KEY, JSON.stringify(stored))
}
