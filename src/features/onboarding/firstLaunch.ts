export const FIRST_LAUNCH_DISMISSED_KEY = 'md-reader:first-launch-dismissed:v1'

export function shouldShowFirstLaunch(storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): boolean {
  return storage?.getItem(FIRST_LAUNCH_DISMISSED_KEY) !== '1'
}

export function dismissFirstLaunch(storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): void {
  try {
    storage?.setItem(FIRST_LAUNCH_DISMISSED_KEY, '1')
  } catch {
    // Private browsing or storage quota must not block opening a document.
  }
}

export function isMarkdownDrop(files: Iterable<Pick<File, 'name'>>): boolean {
  return [...files].some((file) => /\.(md|markdown)$/i.test(file.name))
}
