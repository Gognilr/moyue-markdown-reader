import { describe, expect, it } from 'vitest'
import { DEFAULT_LOCAL_AI_CONFIG, prepareLocalAiClassificationRequest, validateLocalAiConfig } from './localAiBoundary'

describe('optional local AI privacy boundary', () => {
  it('is disabled by default and cannot prepare a request until explicitly enabled', () => {
    expect(DEFAULT_LOCAL_AI_CONFIG.enabled).toBe(false)
    expect(() => prepareLocalAiClassificationRequest(DEFAULT_LOCAL_AI_CONFIG, { text: 'A selected passage.' })).toThrow('disabled')
  })

  it('prepares but never sends a selected-only Ollama request', () => {
    const prepared = prepareLocalAiClassificationRequest(
      { enabled: true, provider: 'ollama', endpoint: 'http://127.0.0.1:11434', model: 'llama3.2:3b' },
      { text: 'Risk: rotate the secret before release.', headingPath: ['Release', 'Risks'] },
    )
    expect(prepared).toMatchObject({ method: 'POST', url: 'http://127.0.0.1:11434/api/generate', disposition: 'prepared-not-sent' })
    expect(prepared.scope).toEqual({ selectedCharacters: 39, extendedCharacters: 0, usedExtendedContext: false })
    expect(JSON.stringify(prepared.body)).toContain('Explicitly selected passage')
    expect(JSON.stringify(prepared.body)).not.toContain('Confirmed context before')
  })

  it('refuses wider context unless a separate confirmation is present', () => {
    const config = { enabled: true, provider: 'custom' as const, endpoint: 'https://ai.example.test/v1/chat/completions', model: 'reader-classifier' }
    const unconfirmed = prepareLocalAiClassificationRequest(config, { text: 'Selected text' }, { before: 'private prior paragraph', after: 'private next paragraph', confirmed: false })
    expect(JSON.stringify(unconfirmed.body)).not.toContain('private prior paragraph')
    const confirmed = prepareLocalAiClassificationRequest(config, { text: 'Selected text' }, { before: 'private prior paragraph', confirmed: true })
    expect(confirmed.scope).toMatchObject({ extendedCharacters: 'private prior paragraph'.length, usedExtendedContext: true })
    expect(JSON.stringify(confirmed.body)).toContain('private prior paragraph')
  })

  it('rejects dangerous endpoints and unsafe model names before request construction', () => {
    expect(validateLocalAiConfig({ enabled: true, provider: 'ollama', endpoint: 'https://ollama.example.test', model: 'llama3' })).toContain('Ollama endpoints must use localhost, 127.0.0.1, or ::1.')
    expect(validateLocalAiConfig({ enabled: true, provider: 'custom', endpoint: 'http://remote.example.test/v1', model: 'model' })).toContain('Custom remote endpoints must use HTTPS; plain HTTP is limited to local loopback.')
    expect(validateLocalAiConfig({ enabled: true, provider: 'custom', endpoint: 'https://user:secret@example.test/v1', model: 'unsafe/model' }).join(' ')).toMatch(/model name.*credentials/i)
  })
})
