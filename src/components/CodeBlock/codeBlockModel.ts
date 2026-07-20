/**
 * Keep line splitting separate from the view so a code block's source is never
 * reconstructed from rendered DOM. This matters for both copying and wrapped
 * display: blank lines and a final empty line remain meaningful source text.
 */
export function codeLines(source: string): string[] {
  return source.split(/\r?\n/)
}

export function codeLineNumberWidth(lineCount: number): number {
  return Math.max(1, String(Math.max(1, lineCount)).length)
}
