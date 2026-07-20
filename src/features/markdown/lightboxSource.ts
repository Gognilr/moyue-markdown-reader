import type { ResourceInventory } from '../health/documentHealth'

function localImageExtension(reference: string): boolean {
  return /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(reference.split(/[?#]/, 1)[0])
}

/** UI preflight; Rust repeats this boundary before handing a path to Windows. */
export function canOpenVerifiedLightboxSource(documentPath: string | null, reference: string | null, inventory: ResourceInventory): reference is string {
  if (!documentPath || !reference || !localImageExtension(reference)) return false
  const path = reference.split(/[?#]/, 1)[0]
  if (!path || path.startsWith('/') || path.startsWith('\\') || /^[a-z][a-z\d+.-]*:/i.test(path)) return false
  if (path.split(/[\\/]/).some((part) => part === '..')) return false
  const metadata = typeof inventory === 'function' ? inventory(reference) : inventory[reference]
  return metadata?.exists === true
}
