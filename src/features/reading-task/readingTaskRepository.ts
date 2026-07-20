import type { ReadingTask, ReadingTaskDocument } from '../../types'

export const READING_TASKS_STORAGE_KEY = 'md-reader:reading-tasks:v1'

export type ReadingTaskDraft = Pick<ReadingTask, 'purpose' | 'budgetMinutes' | 'expectedResult'>

export function createReadingTask(draft: ReadingTaskDraft, now = Date.now()): ReadingTask {
  return {
    version: 1,
    id: `reading-task-${now}-${Math.random().toString(36).slice(2, 8)}`,
    purpose: draft.purpose.trim(),
    budgetMinutes: Math.max(1, Math.min(24 * 60, Math.round(draft.budgetMinutes || 15))),
    expectedResult: draft.expectedResult.trim(),
    documents: [],
    result: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function addReadingTaskDocuments(task: ReadingTask, documents: readonly Omit<ReadingTaskDocument, 'completedAt'>[], now = Date.now()): ReadingTask {
  const known = new Set(task.documents.map((document) => document.key))
  const additions: ReadingTaskDocument[] = []
  for (const document of documents) {
    if (!document.key || known.has(document.key)) continue
    known.add(document.key)
    additions.push({ ...document, completedAt: null })
  }
  return additions.length === 0 ? task : { ...task, documents: [...task.documents, ...additions], updatedAt: now }
}

export function updateReadingTask(task: ReadingTask, patch: Partial<Pick<ReadingTask, 'purpose' | 'budgetMinutes' | 'expectedResult' | 'result'>>, now = Date.now()): ReadingTask {
  return {
    ...task,
    ...patch,
    purpose: patch.purpose === undefined ? task.purpose : patch.purpose.trim(),
    expectedResult: patch.expectedResult === undefined ? task.expectedResult : patch.expectedResult.trim(),
    budgetMinutes: patch.budgetMinutes === undefined ? task.budgetMinutes : Math.max(1, Math.min(24 * 60, Math.round(patch.budgetMinutes || 15))),
    updatedAt: now,
  }
}

export function setReadingTaskDocumentCompleted(task: ReadingTask, key: string, completed: boolean, now = Date.now()): ReadingTask {
  return {
    ...task,
    documents: task.documents.map((document) => document.key === key ? { ...document, completedAt: completed ? now : null } : document),
    updatedAt: now,
  }
}

export function removeReadingTaskDocument(task: ReadingTask, key: string, now = Date.now()): ReadingTask {
  return { ...task, documents: task.documents.filter((document) => document.key !== key), updatedAt: now }
}

function isTask(value: unknown): value is ReadingTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<ReadingTask>
  return task.version === 1 && typeof task.id === 'string' && typeof task.purpose === 'string'
    && typeof task.budgetMinutes === 'number' && typeof task.expectedResult === 'string'
    && Array.isArray(task.documents) && typeof task.result === 'string'
}

export function loadReadingTasks(storage: Storage = localStorage): ReadingTask[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(READING_TASKS_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isTask).sort((a, b) => b.updatedAt - a.updatedAt) : []
  } catch {
    return []
  }
}

export function saveReadingTasks(tasks: readonly ReadingTask[], storage: Storage = localStorage): void {
  storage.setItem(READING_TASKS_STORAGE_KEY, JSON.stringify(tasks))
}
