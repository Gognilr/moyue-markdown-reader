import { describe, expect, it } from 'vitest'
import { createFocusTimer, focusTimerReducer, formatFocusTime } from './focusTimer'

describe('focus timer state machine', () => {
  it('runs, pauses, resumes and finishes without side effects', () => {
    let state = createFocusTimer(60)
    state = focusTimerReducer(state, { type: 'start' })
    state = focusTimerReducer(state, { type: 'tick' })
    expect(state.remainingSeconds).toBe(59)
    state = focusTimerReducer(state, { type: 'pause' })
    expect(focusTimerReducer(state, { type: 'tick' }).remainingSeconds).toBe(59)
    expect(focusTimerReducer(state, { type: 'resume' }).phase).toBe('running')
  })
  it('formats duration predictably', () => expect(formatFocusTime(61)).toBe('01:01'))
})
