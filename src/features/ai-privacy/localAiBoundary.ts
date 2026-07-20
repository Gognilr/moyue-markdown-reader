/**
 * Privacy-first request preparation for the optional local AI feature.
 *
 * This module intentionally has no `fetch`, Tauri, persistence, or UI imports.
 * It can prepare a narrowly scoped request for a caller, but only a future,
 * explicitly user-initiated transport may send it.
 */
export type LocalAiProvider = 'ollama' | 'custom'

export interface LocalAiConfig {
  enabled: boolean
  provider: LocalAiProvider
  /** Base URL for Ollama, or the complete chat-completions URL for custom APIs. */
  endpoint: string
  model: string
}

export interface ExplicitSelection {
  /** Text selected by the reader in the currently visible document. */
  text: string
  /** Optional source-only label; it is never replaced by an AI answer. */
  headingPath?: string[]
}

export interface ExtendedContext {
  before?: string
  after?: string
  /** This must be set by an explicit, separate reader confirmation. */
  confirmed: boolean
}

export interface PreparedLocalAiRequest {
  /** A transport can use this data, but this module never sends it. */
  method: 'POST'
  url: string
  headers: Readonly<Record<'content-type', 'application/json'>>
  body: Readonly<Record<string, unknown>>
  /** Makes the non-sending boundary inspectable by UI and tests. */
  disposition: 'prepared-not-sent'
  scope: {
    selectedCharacters: number
    extendedCharacters: number
    usedExtendedContext: boolean
  }
}

export const DEFAULT_LOCAL_AI_CONFIG: Readonly<LocalAiConfig> = Object.freeze({
  enabled: false,
  provider: 'ollama',
  endpoint: 'http://127.0.0.1:11434',
  model: '',
})

const MAX_SELECTION_CHARACTERS = 12_000
const MAX_CONTEXT_CHARACTERS = 4_000
const MAX_MODEL_CHARACTERS = 160
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/** Returns field-specific errors instead of silently repairing a user endpoint. */
export function validateLocalAiConfig(config: LocalAiConfig): string[] {
  const errors: string[] = []
  if (!config.enabled) return errors
  if (!isSafeModelName(config.model)) errors.push('Choose a model name using 1–160 letters, numbers, dots, underscores, colons, or hyphens.')
  const endpoint = parseSafeEndpoint(config.endpoint, config.provider)
  if (endpoint instanceof Error) errors.push(endpoint.message)
  return errors
}

/**
 * Creates a request description for classification assistance.  It never sends
 * data and never accepts a whole document.  The selected text is the mandatory
 * payload; wider context is only included after its own explicit confirmation.
 */
export function prepareLocalAiClassificationRequest(
  config: LocalAiConfig,
  selection: ExplicitSelection,
  extendedContext?: ExtendedContext,
): PreparedLocalAiRequest {
  if (!config.enabled) throw new Error('Optional AI is disabled. Enable it explicitly before preparing a request.')
  const errors = validateLocalAiConfig(config)
  if (errors.length) throw new Error(errors.join(' '))
  const selected = normalizeBoundedText(selection.text, MAX_SELECTION_CHARACTERS, 'Select a non-empty passage shorter than 12,000 characters.')
  const endpoint = parseSafeEndpoint(config.endpoint, config.provider)
  if (endpoint instanceof Error) throw endpoint

  const before = extendedContext?.confirmed ? boundedOptionalText(extendedContext.before) : ''
  const after = extendedContext?.confirmed ? boundedOptionalText(extendedContext.after) : ''
  const prompt = buildClassificationPrompt(selected, selection.headingPath, before, after)
  const url = requestUrl(endpoint, config.provider)
  const body = config.provider === 'ollama'
    ? { model: config.model.trim(), prompt, stream: false, format: 'json', options: { temperature: 0 } }
    : {
      model: config.model.trim(), temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Classify only the supplied passage. Return JSON with an optional categories array. Do not rewrite, infer missing text, or claim to have read the document.' },
        { role: 'user', content: prompt },
      ],
    }
  return {
    method: 'POST', url, headers: { 'content-type': 'application/json' }, body,
    disposition: 'prepared-not-sent',
    scope: { selectedCharacters: selected.length, extendedCharacters: before.length + after.length, usedExtendedContext: Boolean(before || after) },
  }
}

function isSafeModelName(value: string): boolean {
  const model = value.trim()
  return model.length > 0 && model.length <= MAX_MODEL_CHARACTERS && /^[A-Za-z0-9._:-]+$/.test(model)
}

function parseSafeEndpoint(value: string, provider: LocalAiProvider): URL | Error {
  let url: URL
  try { url = new URL(value.trim()) } catch { return new Error('Enter a complete http:// or https:// endpoint URL.') }
  if (!['http:', 'https:'].includes(url.protocol)) return new Error('Only http and https endpoints are allowed.')
  if (url.username || url.password || url.search || url.hash) return new Error('Endpoint URLs cannot contain credentials, query strings, or fragments.')
  const local = LOCAL_HOSTS.has(url.hostname.toLowerCase())
  if (provider === 'ollama' && !local) return new Error('Ollama endpoints must use localhost, 127.0.0.1, or ::1.')
  if (url.protocol === 'http:' && !local) return new Error('Custom remote endpoints must use HTTPS; plain HTTP is limited to local loopback.')
  return url
}

function requestUrl(endpoint: URL, provider: LocalAiProvider): string {
  if (provider === 'custom') return endpoint.toString()
  const path = endpoint.pathname.replace(/\/+$/, '')
  if (path && path !== '/api/generate') throw new Error('Ollama endpoint must be its base URL or end with /api/generate.')
  endpoint.pathname = '/api/generate'
  return endpoint.toString()
}

function normalizeBoundedText(value: string, max: number, message: string): string {
  const normalized = value.replace(/\u0000/g, '').trim()
  if (!normalized || normalized.length > max) throw new Error(message)
  return normalized
}

function boundedOptionalText(value?: string): string {
  if (!value) return ''
  return value.replace(/\u0000/g, '').trim().slice(0, MAX_CONTEXT_CHARACTERS)
}

function buildClassificationPrompt(selected: string, headingPath: string[] | undefined, before: string, after: string): string {
  const heading = headingPath?.filter(Boolean).join(' / ')
  const context = [
    heading ? `Source heading (metadata): ${heading}` : '',
    before ? `Confirmed context before:\n${before}` : '',
    `Explicitly selected passage:\n${selected}`,
    after ? `Confirmed context after:\n${after}` : '',
  ].filter(Boolean).join('\n\n')
  return `Classify the explicitly selected Markdown passage for local reading aids. Keep the original text authoritative. Return JSON only, for example {"categories":["risk"],"reason":"explicit warning"}.\n\n${context}`
}
