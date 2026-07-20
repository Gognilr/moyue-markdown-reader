import type { BlockIR, DocumentIR, InlineIR } from './documentIr'
import { fileService } from '../../services/fileService'

export interface ExportImageResource {
  bytes: Uint8Array
  mimeType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/bmp'
  width: number
  height: number
}

export type ExportImageResolver = (url: string) => Promise<ExportImageResource | null>

export async function resolveExportImages(
  ir: DocumentIR,
  sourcePath?: string,
  resolver?: ExportImageResolver,
): Promise<Record<string, ExportImageResource>> {
  const urls = [...collectImageUrls(ir.blocks)]
  const effective = resolver ?? (sourcePath ? async (url: string) => {
    try {
      const resource = await fileService.readVerifiedLocalImage(sourcePath, url)
      if (!isSupportedImageMime(resource.mimeType)) return null
      const dimensions = imageDimensions(resource.bytes, resource.mimeType)
      if (!dimensions) return null
      return { ...resource, mimeType: resource.mimeType, ...dimensions }
    } catch {
      return null
    }
  } : undefined)
  if (!effective) return {}
  const entries = await Promise.all(urls.map(async (url) => [url, await effective(url)] as const))
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, ExportImageResource] => entry[1] !== null))
}

export function fitImage(width: number, height: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / Math.max(width, 1), maxHeight / Math.max(height, 1))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function collectImageUrls(blocks: BlockIR[]): Set<string> {
  const urls = new Set<string>()
  const inline = (children: InlineIR[]) => children.forEach((child) => {
    if (child.kind === 'image') urls.add(child.url)
    else if ('children' in child) inline(child.children)
  })
  blocks.forEach((block) => {
    switch (block.kind) {
      case 'image': urls.add(block.url); break
      case 'heading': case 'paragraph': inline(block.children); break
      case 'list': block.items.forEach((item) => collectImageUrls(item.blocks).forEach((url) => urls.add(url))); break
      case 'blockquote': collectImageUrls(block.blocks).forEach((url) => urls.add(url)); break
      case 'table':
        block.header.cells.forEach((cell) => inline(cell.children))
        block.rows.forEach((row) => row.cells.forEach((cell) => inline(cell.children)))
        break
    }
  })
  return urls
}

function isSupportedImageMime(value: string): value is ExportImageResource['mimeType'] {
  return value === 'image/png' || value === 'image/jpeg' || value === 'image/gif' || value === 'image/bmp'
}

export function imageDimensions(bytes: Uint8Array, mimeType: ExportImageResource['mimeType']): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (mimeType === 'image/png' && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) }
  if (mimeType === 'image/gif' && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) }
  if (mimeType === 'image/bmp' && bytes.length >= 26) return { width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) }
  if (mimeType === 'image/jpeg' && bytes.length >= 4) {
    let offset = 2
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      const length = view.getUint16(offset + 2)
      if (marker >= 0xc0 && marker <= 0xc3) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
      if (length < 2) break
      offset += 2 + length
    }
  }
  return null
}
