/**
 * Pure matching logic for recovering a Markdown file that was moved on disk.
 *
 * The caller owns filesystem access: it should scan only the old parent
 * directory, read a bounded set of candidates, then pass their metadata here.
 * This keeps browser preview free of filesystem assumptions and makes the
 * ranking policy testable before a native command is wired in.
 */
export interface ContentFingerprint {
  version: 1
  hash: string
  characters: number
  lines: number
}

export interface LostFileIdentity {
  path: string
  fingerprint?: ContentFingerprint
}

export interface RelocationCandidate {
  path: string
  fingerprint?: ContentFingerprint
}

export interface RelocationMatch {
  candidate: RelocationCandidate
  score: number
  confidence: 'high' | 'medium' | 'low'
  reasons: Array<'content-fingerprint' | 'file-name' | 'file-stem' | 'same-directory'>
}

/** A stable, non-cryptographic identity for matching a previously read file. */
export function createContentFingerprint(markdown: string): ContentFingerprint {
  const normalized = markdown.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim()
  return {
    version: 1,
    hash: fnv1a(`${normalized.length}\n${normalized}`),
    // Keep metadata aligned with the normalized digest so CRLF/LF conversions
    // do not prevent recovery of an otherwise identical document.
    characters: normalized.length,
    lines: normalized === '' ? 0 : normalized.split('\n').length,
  }
}

/**
 * Sort candidates deterministically. Equal content is deliberately dominant:
 * a renamed file should win over a merely similarly named sibling.
 */
export function rankRelocationCandidates(identity: LostFileIdentity, candidates: RelocationCandidate[]): RelocationMatch[] {
  const oldName = basename(identity.path).toLocaleLowerCase()
  const oldStem = stem(oldName)
  const oldDirectory = dirname(identity.path)

  return candidates
    .map((candidate): RelocationMatch => {
      const reasons: RelocationMatch['reasons'] = []
      const name = basename(candidate.path).toLocaleLowerCase()
      let score = 0
      if (sameFingerprint(identity.fingerprint, candidate.fingerprint)) {
        score += 100
        reasons.push('content-fingerprint')
      }
      if (name === oldName) {
        score += 35
        reasons.push('file-name')
      } else if (stem(name) === oldStem) {
        score += 18
        reasons.push('file-stem')
      }
      if (dirname(candidate.path) === oldDirectory) {
        score += 8
        reasons.push('same-directory')
      }
      return { candidate, score, confidence: confidenceFor(score, reasons), reasons }
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || comparePaths(left.candidate.path, right.candidate.path))
}

/**
 * Returns an automatic recommendation only when evidence is strong. A matching
 * filename alone remains a suggestion, so unrelated documents are never
 * silently reopened after a move.
 */
export function recommendRelocation(identity: LostFileIdentity, candidates: RelocationCandidate[]): RelocationMatch | null {
  const [best, second] = rankRelocationCandidates(identity, candidates)
  if (!best || best.confidence !== 'high') return null
  if (second && second.score === best.score) return null
  return best
}

function sameFingerprint(left?: ContentFingerprint, right?: ContentFingerprint): boolean {
  return Boolean(left && right && left.version === 1 && right.version === 1
    && left.hash === right.hash && left.characters === right.characters && left.lines === right.lines)
}

function confidenceFor(score: number, reasons: RelocationMatch['reasons']): RelocationMatch['confidence'] {
  if (reasons.includes('content-fingerprint')) return 'high'
  if (score >= 35) return 'medium'
  return 'low'
}

function basename(path: string): string { return path.replace(/\\/g, '/').split('/').pop() ?? '' }
function dirname(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index).toLocaleLowerCase()
}
function stem(fileName: string): string { return fileName.replace(/\.(md|markdown)$/i, '') }
function comparePaths(left: string, right: string): number { return left.localeCompare(right, undefined, { sensitivity: 'base' }) }

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
