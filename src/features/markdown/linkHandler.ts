// 链接与图片处理器
// 1. createImageTransformer: 将 Markdown 中的本地相对路径图片解析为 Tauri 安全协议 URL
// 2. createLinkClickHandler: 拦截外部超链接点击，通过系统浏览器打开

import { convertFileSrc } from '@tauri-apps/api/core'
import { shellService } from '../../services/shellService'

/** 判断当前是否运行在 Tauri 环境中 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * 从文件绝对路径中提取所在目录
 * 同时兼容 Windows 反斜杠和 Unix 正斜杠
 */
function getBaseDir(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastSlash === -1) return ''
  return filePath.substring(0, lastSlash)
}

/**
 * 同步拼接相对路径到绝对路径（模拟 path.join）
 * 用于在 urlTransform 同步上下文中即时解析
 */
function resolvePathSync(baseDir: string, relativePath: string): string {
  // 去除开头的 ./
  const rel = relativePath.replace(/^\.\//, '')
  // 统一用 / 分割
  const baseParts = baseDir.split(/[/\\]/).filter(Boolean)
  const relParts = rel.split(/[/\\]/)

  for (const part of relParts) {
    if (part === '..') {
      baseParts.pop()
    } else if (part === '.' || part === '') {
      continue
    } else {
      baseParts.push(part)
    }
  }

  // 判断是否为 Windows 盘符路径（如 C:）
  const isWindowsRoot = /^[a-zA-Z]:$/.test(baseParts[0] || '')
  const joined = baseParts.join('/')
  return isWindowsRoot ? joined : '/' + joined
}

/** 判断是否为绝对路径（Windows 盘符路径或 Unix 根路径） */
function isAbsolutePath(p: string): boolean {
  return /^([a-zA-Z]:[\\/]|\/)/.test(p)
}

/**
 * 创建图片 URL 转换器
 * 在 react-markdown 的 urlTransform 属性中使用，同步调用
 * @param currentPath 当前打开的 .md 文件绝对路径
 */
export type ImageTransformer = ((src: string) => string) & {
  /** Recover the authored Markdown URL after react-markdown has transformed it. */
  originalFor: (renderedSrc: string) => string | null
}

export function createImageTransformer(currentPath: string | null, resolvedLocalImages: Readonly<Record<string, string>> = {}): ImageTransformer {
  const originals = new Map<string, string>()
  const transform = ((src: string): string => {
    if (!src) return src

    const resolved = resolvedLocalImages[src]
    if (resolved) {
      originals.set(resolved, src)
      return resolved
    }

    // 外部网络协议或 data/blob URI，直接放行
    if (/^(https?|data|asset|blob|tauri):/.test(src)) {
      originals.set(src, src)
      return src
    }

    // 非 Tauri 环境下无法转换，直接返回原值
    if (!isTauri()) {
      originals.set(src, src)
      return src
    }

    // 已经是绝对路径，直接转换
    if (isAbsolutePath(src)) {
      const rendered = convertFileSrc(src)
      originals.set(rendered, src)
      return rendered
    }

    // 相对路径：基于当前文件目录解析为绝对路径后转换
    if (currentPath) {
      const baseDir = getBaseDir(currentPath)
      const absolutePath = resolvePathSync(baseDir, src)
      const rendered = convertFileSrc(absolutePath)
      originals.set(rendered, src)
      return rendered
    }

    originals.set(src, src)
    return src
  }) as ImageTransformer
  transform.originalFor = (renderedSrc) => originals.get(renderedSrc) ?? null
  return transform
}

/**
 * 创建超链接点击处理器
 * 拦截所有外部链接点击，通过系统默认浏览器打开
 */
export function createLinkClickHandler() {
  return (e: React.MouseEvent<HTMLAnchorElement>, href?: string) => {
    if (!href) return
    e.preventDefault()
    shellService.openExternal(href)
  }
}
