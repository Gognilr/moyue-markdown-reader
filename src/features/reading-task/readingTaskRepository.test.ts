import { describe, expect, it } from 'vitest'
import { addReadingTaskDocuments, createReadingTask, loadReadingTasks, removeReadingTaskDocument, saveReadingTasks, setReadingTaskDocumentCompleted, updateReadingTask } from './readingTaskRepository'

describe('reading task repository', () => {
  it('keeps a local task focused on intent, budget, sources and result', () => {
    const task = createReadingTask({ purpose: '决定是否上线', budgetMinutes: 20, expectedResult: '写出结论' }, 100)
    const withDocuments = addReadingTaskDocuments(task, [
      { key: 'a.md', path: 'a.md', title: '方案 A' },
      { key: 'a.md', path: 'a.md', title: '重复' },
    ], 110)
    const complete = setReadingTaskDocumentCompleted(withDocuments, 'a.md', true, 120)
    expect(complete.documents).toEqual([{ key: 'a.md', path: 'a.md', title: '方案 A', completedAt: 120 }])
    expect(updateReadingTask(complete, { result: '暂缓上线' }, 130).result).toBe('暂缓上线')
    expect(removeReadingTaskDocument(complete, 'a.md', 140).documents).toEqual([])
  })

  it('round-trips through a supplied local storage without accepting malformed entries', () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } } as unknown as Storage
    const task = createReadingTask({ purpose: '理解', budgetMinutes: 5, expectedResult: '摘要' }, 1)
    saveReadingTasks([task], storage)
    expect(loadReadingTasks(storage)).toEqual([task])
    storage.setItem('md-reader:reading-tasks:v1', '[{"oops":true}]')
    expect(loadReadingTasks(storage)).toEqual([])
  })
})
