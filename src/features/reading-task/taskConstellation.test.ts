import { describe, expect, it } from 'vitest'
import { buildTaskConstellation } from './taskConstellation'
import type { ReadingTask } from '../../types'

const task: ReadingTask = {
  version: 1, id: 'task-1', purpose: '形成判断', budgetMinutes: 20, expectedResult: '结论', result: '', createdAt: 1, updatedAt: 1,
  documents: [
    { key: 'a', path: 'a.md', title: '方案', completedAt: 2 },
    { key: 'b', path: 'b.md', title: '风险', completedAt: null },
  ],
}

describe('task constellation', () => {
  it('maps only explicit task documents with deterministic positions and completion', () => {
    const first = buildTaskConstellation(task)
    expect(first).toEqual(buildTaskConstellation(task))
    expect(first).toMatchObject({ completedCount: 1, totalCount: 2 })
    expect(first.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'a', completed: true, x: 50, y: 13 }),
      expect.objectContaining({ key: 'b', completed: false, x: 50, y: 87 }),
    ]))
  })

  it('keeps an empty task map empty instead of inventing document relationships', () => {
    expect(buildTaskConstellation({ ...task, documents: [] })).toEqual({ completedCount: 0, totalCount: 0, nodes: [] })
  })
})
