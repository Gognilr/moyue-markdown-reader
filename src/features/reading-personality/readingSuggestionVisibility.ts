/** Empty first-launch state must not pretend it has inspected a document. */
export function hasReadableDocument(path: string | null, markdown: string): boolean {
  return Boolean(path || markdown.trim())
}
