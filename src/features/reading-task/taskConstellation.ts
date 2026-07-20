import type { ReadingTask } from '../../types'

export type TaskConstellationNode = {
  key: string
  title: string
  path: string | null
  completed: boolean
  x: number
  y: number
}

export type TaskConstellation = {
  completedCount: number
  totalCount: number
  nodes: TaskConstellationNode[]
}

/**
 * Produces a small deterministic, local-only task map. The task is the centre;
 * each explicitly added document is a source node. This intentionally models
 * neither implicit links nor a general knowledge graph.
 */
export function buildTaskConstellation(task: ReadingTask): TaskConstellation {
  const totalCount = task.documents.length
  const completedCount = task.documents.filter((document) => document.completedAt !== null).length
  const nodes = task.documents.map((document, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(totalCount, 1)
    return {
      key: document.key,
      title: document.title,
      path: document.path,
      completed: document.completedAt !== null,
      x: 50 + Math.cos(angle) * 37,
      y: 50 + Math.sin(angle) * 37,
    }
  })
  return { completedCount, totalCount, nodes }
}
