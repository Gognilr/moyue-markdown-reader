/** Opens every authored disclosure block before a recovery target is located. */
export function expandDisclosureBlocks(root: ParentNode): number {
  const details = root.querySelectorAll<HTMLDetailsElement>('details')
  details.forEach((item) => { item.open = true })
  return details.length
}
