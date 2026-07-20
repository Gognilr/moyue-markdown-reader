// 文件操作服务 —— 封装 Tauri 文件系统 API 的唯一出口
// 在非 Tauri 环境（纯浏览器开发预览）下回退到浏览器 API，保证开发可运行

/** 判断当前是否运行在 Tauri 桌面环境中 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// 浏览器兜底：缓存用户通过 input[type=file] 选择的 File 对象
// key 为文件名（伪路径），value 为 File 对象
const browserFileCache = new Map<string, File>()

export interface PickedBinaryFile {
  name: string
  bytes: Uint8Array
}

export type ExportSaveResult = { kind: 'native'; path: string } | { kind: 'browser'; fileName: string }
export type MarkdownPathStatus = 'authorized' | 'exists' | 'missing' | 'invalid'

export const fileService = {
  /** Registers a browser-dropped Markdown file for the same read/open flow as the picker. */
  registerBrowserFile(file: File): string {
    const pseudoPath = file.name
    browserFileCache.set(pseudoPath, file)
    return pseudoPath
  },

  /**
   * 弹出系统文件选择对话框，返回用户选择的 .md 文件路径
   * 浏览器模式下，把 File 对象缓存到内存中，返回文件名作为伪路径
   * @returns 文件绝对路径，用户取消时返回 null
   */
  async openFileDialog(): Promise<string | null> {
    if (!isTauri()) {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.md,.markdown,text/markdown'
        input.onchange = () => {
          const file = input.files?.[0]
          if (!file) {
            resolve(null)
            return
          }
          // 用文件名作为伪路径，并缓存 File 对象供 readTextFile 使用
          resolve(fileService.registerBrowserFile(file))
        }
        // 用户取消时 onchange 不会触发，这里不阻塞
        input.click()
      })
    }
    try {
      // Native command owns both the OS picker and the subsequent dynamic
      // filesystem/asset scope grant.  Do not replace this with the dialog
      // plugin directly: a renderer-provided path must never expand scope.
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string | null>('pick_markdown_document')
    } catch (e) {
      console.error('打开文件对话框失败:', e)
      return null
    }
  },

  /**
   * Selects one reader open-package without granting it filesystem scope.
   * Browser selections are retained only long enough to copy their bytes.
   */
  async pickOpenPackage(): Promise<PickedBinaryFile | null> {
    if (!isTauri()) {
      return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.mdpack.zip,application/zip'
        input.onchange = () => {
          const file = input.files?.[0]
          if (!file) { resolve(null); return }
          if (!file.name.toLowerCase().endsWith('.mdpack.zip')) {
            resolve(null)
            return
          }
          void file.arrayBuffer().then((buffer) => resolve({ name: file.name, bytes: new Uint8Array(buffer) }))
            .catch(() => resolve(null))
        }
        input.click()
      })
    }
    const { invoke } = await import('@tauri-apps/api/core')
    const selected = await invoke<{ name: string; bytes: number[] } | null>('pick_open_package')
    return selected ? { name: selected.name, bytes: new Uint8Array(selected.bytes) } : null
  },

  /**
   * 弹出系统保存对话框，返回用户选择的保存路径
   * @param defaultName 建议的默认文件名
   */
  async saveFileDialog(defaultName?: string): Promise<string | null> {
    if (!isTauri()) return defaultName || 'untitled.md'
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string | null>('pick_markdown_save_path', { defaultName })
    } catch (e) {
      console.error('保存文件对话框失败:', e)
      return null
    }
  },

  /** Lets the operating system choose an explicit DOCX or PDF destination. */
  async saveExportFile(blob: Blob, defaultName: string, format: 'docx' | 'pdf' | 'xlsx'): Promise<ExportSaveResult | null> {
    const fileName = defaultName.toLowerCase().endsWith(`.${format}`) ? defaultName : `${defaultName}.${format}`
    if (!isTauri()) {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = fileName
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      return { kind: 'browser', fileName }
    }
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await invoke<string | null>('pick_export_save_path', { defaultName: fileName, format })
    if (!path) return null
    await invoke('write_export_binary', { path, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) })
    return { kind: 'native', path }
  },

  /**
   * 读取本地文本文件内容
   * 浏览器模式下，从缓存中取 File 对象并用 FileReader 读取
   * @param path 文件绝对路径（浏览器下为伪路径/文件名）
   */
  async readTextFile(path: string): Promise<string> {
    if (!isTauri()) {
      const cachedFile = browserFileCache.get(path)
      if (!cachedFile) {
        throw new Error(`未找到文件缓存：${path}（浏览器模式仅支持本次会话内打开的文件）`)
      }
      return await cachedFile.text()
    }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      return await invoke<string>('read_markdown_text', { path })
    } catch (encodingError) {
      console.warn('Native encoding-aware read failed; falling back to the filesystem plugin.', encodingError)
    }
    try {
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      return await readTextFile(path)
    } catch (e) {
      console.error('读取文件失败:', e)
      throw e
    }
  },

  /**
   * 将文本内容写入本地文件
   * @param path 文件绝对路径
   * @param content 文本内容
   */
  async writeTextFile(path: string, content: string): Promise<void> {
    if (!isTauri()) {
      // 浏览器兜底：触发下载
      const blob = new Blob([content], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = path.split(/[/\\]/).pop() || 'untitled.md'
      a.click()
      URL.revokeObjectURL(url)
      return
    }
    try {
      // The native boundary owns atomic replacement.  In particular, Windows
      // cannot reliably replace an existing target through the plugin rename
      // path used by the renderer.
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('write_markdown_text', { path, content })
    } catch (e) {
      console.error('写入文件失败:', e)
      throw e
    }
  },

  /**
   * Moves one Markdown file without overwrite. The caller must obtain an
   * explicit destination from the user and update its own UI state only after
   * this promise resolves. A failed rename leaves the source path untouched.
   */
  async relocateTextFile(sourcePath: string, destinationPath: string): Promise<void> {
    if (!isMarkdownPath(sourcePath) || !isMarkdownPath(destinationPath)) {
      throw new Error('Only .md and .markdown files can be moved by the reader.')
    }
    if (samePath(sourcePath, destinationPath)) return
    if (!isTauri()) throw new Error('Moving local files is available only in the desktop app.')
    const { exists, rename } = await import('@tauri-apps/plugin-fs')
    if (!await exists(sourcePath)) throw new Error('Source file no longer exists.')
    if (await exists(destinationPath)) throw new Error('Destination already exists; refusing to overwrite it.')
    await rename(sourcePath, destinationPath)
  },

  /** Opens an already-inspected, document-relative image in its system handler. */
  async openVerifiedLocalImage(documentPath: string, reference: string): Promise<void> {
    if (!isTauri()) throw new Error('Opening the original local image is available only in the desktop app.')
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_verified_local_image', { documentPath, reference })
  },

  async readVerifiedLocalImage(documentPath: string, reference: string): Promise<{ mimeType: string; bytes: Uint8Array }> {
    if (!isTauri()) throw new Error('Embedding local images is available only in the desktop app.')
    const { invoke } = await import('@tauri-apps/api/core')
    const resource = await invoke<{ mimeType: string; dataBase64: string }>('read_verified_local_image', { documentPath, reference })
    return { mimeType: resource.mimeType, bytes: decodeBase64(resource.dataBase64) }
  },

  async readWindowsCjkFont(): Promise<Uint8Array> {
    if (!isTauri()) throw new Error('Windows CJK font embedding is available only in the desktop app.')
    const { invoke } = await import('@tauri-apps/api/core')
    const resource = await invoke<{ dataBase64: string }>('read_windows_cjk_font')
    return decodeBase64(resource.dataBase64)
  },

  /** 监听单个文件的磁盘变更；浏览器预览模式不支持。 */
  async watchTextFile(path: string, onChange: () => void): Promise<(() => void) | null> {
    if (!isTauri()) return null
    const { watch } = await import('@tauri-apps/plugin-fs')
    return watch(path, () => onChange(), { delayMs: 250 })
  },

  /**
   * 检查本地文件是否存在
   * 浏览器模式下检查是否在本次会话的文件缓存中
   * @param path 文件绝对路径
   */
  async exists(path: string): Promise<boolean> {
    if (!isTauri()) return browserFileCache.has(path)
    try {
      const { exists } = await import('@tauri-apps/plugin-fs')
      return await exists(path)
    } catch {
      return false
    }
  },

  /**
   * Classifies a persisted history path without turning a permission failure
   * into a false "file moved" result. This inspection never grants access.
   */
  async inspectMarkdownPath(path: string): Promise<MarkdownPathStatus> {
    if (!isTauri()) return browserFileCache.has(path) ? 'authorized' : 'missing'
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<MarkdownPathStatus>('inspect_markdown_path_status', { path })
  },

  /**
   * 获取文件所在目录的绝对路径
   * @param filePath 文件绝对路径
   */
  async getDirname(filePath: string): Promise<string> {
    if (!isTauri()) return ''
    try {
      const { dirname } = await import('@tauri-apps/api/path')
      return await dirname(filePath)
    } catch (e) {
      console.error('获取目录路径失败:', e)
      return ''
    }
  },

  /**
   * 将相对路径拼接为绝对路径
   * @param baseDir 基准目录
   * @param relativePath 相对路径
   */
  async joinPath(baseDir: string, relativePath: string): Promise<string> {
    if (!isTauri()) return relativePath
    try {
      const { join } = await import('@tauri-apps/api/path')
      return await join(baseDir, relativePath)
    } catch (e) {
      console.error('拼接路径失败:', e)
      return relativePath
    }
  },

  /**
   * 将本地文件绝对路径转换为 Tauri 安全内置协议 URL（用于本地图片渲染）
   * @param absolutePath 本地文件绝对路径
   */
  async convertFileSrc(absolutePath: string): Promise<string> {
    if (!isTauri()) return absolutePath
    try {
      const { convertFileSrc } = await import('@tauri-apps/api/core')
      return convertFileSrc(absolutePath)
    } catch (e) {
      console.error('转换文件 URL 失败:', e)
      return absolutePath
    }
  },

  /**
   * 从文件路径中提取文件名
   * @param filePath 文件路径
   * @param withExt 是否保留扩展名
   */
  getFileName(filePath: string, withExt = true): string {
    const fileName = filePath.split(/[/\\]/).pop() || ''
    if (withExt) return fileName
    return fileName.replace(/\.(md|markdown)$/i, '') || '未命名'
  },
}

function isMarkdownPath(path: string): boolean { return /\.(md|markdown)$/i.test(path.trim()) }
function samePath(left: string, right: string): boolean {
  return left.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
    === right.replace(/\\/g, '/').replace(/\/+$/, '').toLocaleLowerCase()
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

// 导出 isTauri 供其他服务复用
export { isTauri }
