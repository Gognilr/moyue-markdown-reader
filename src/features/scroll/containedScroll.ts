export interface ContainedScrollMetrics {
  currentScrollTop: number
  clientHeight: number
  scrollHeight: number
  containerTop: number
  targetTop: number
  topInset: number
}

/** Calculates a scroll position without asking the browser to scroll ancestors. */
export function containedStartScrollTop(metrics: ContainedScrollMetrics): number {
  const desired = metrics.currentScrollTop + metrics.targetTop - metrics.containerTop - metrics.topInset
  return Math.min(Math.max(0, desired), Math.max(0, metrics.scrollHeight - metrics.clientHeight))
}

/** Returns the first document block below the reading guide. */
export function nextBlockIndex(blockTops: readonly number[], guideTop: number, tolerance = 8): number {
  return blockTops.findIndex((top) => Number.isFinite(top) && top > guideTop + tolerance)
}
