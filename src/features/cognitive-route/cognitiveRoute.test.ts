import { describe, expect, it } from 'vitest'
import { markdownToDocumentIR } from '../export/markdownToIr'
import { buildCognitiveRoute, classifyBlock, documentIrToCognitiveBlocks } from './cognitiveRoute'

const source = `# 部署指南

## 前置条件

需要 Node 20 和可用的数据库。

## 结论

因此建议先在预发布环境验证。

## 证据

压测显示 P95 延迟降低 30%。

## 风险

警告：不要在高峰期迁移。

## 步骤

1. 安装依赖
2. 运行迁移
3. 验证健康检查
4. 发布服务
5. 观察指标`

describe('cognitive route rules', () => {
  it('classifies all five grammar kinds using explainable rules', () => {
    expect(classifyBlock('需要先配置环境')).toMatchObject({ kind: 'prerequisite' })
    expect(classifyBlock('因此建议采用方案 A')).toMatchObject({ kind: 'conclusion' })
    expect(classifyBlock('警告：不要删除数据')).toMatchObject({ kind: 'risk' })
    expect(classifyBlock('1. 安装依赖')).toMatchObject({ kind: 'step' })
    expect(classifyBlock('压测显示延迟降低')).toMatchObject({ kind: 'evidence' })
  })

  it('creates deterministic stable anchors with source neighbourhood', () => {
    const document = markdownToDocumentIR(source)
    const first = documentIrToCognitiveBlocks(document)
    const second = documentIrToCognitiveBlocks(document)
    expect(first.map((block) => block.anchor)).toEqual(second.map((block) => block.anchor))
    expect(first[1].anchor).toMatchObject({ headingPath: ['部署指南', '结论'], previousFingerprint: expect.any(String), nextFingerprint: expect.any(String) })
  })

  it('honours purpose priority and 5/15/full budget limits', () => {
    const document = markdownToDocumentIR(source)
    const quick = buildCognitiveRoute(document, 'quick-overview', 5)
    const execute = buildCognitiveRoute(document, 'follow-steps', 15)
    const full = buildCognitiveRoute(document, 'complete-reading', 'full')
    expect(quick.nodes).toHaveLength(5)
    expect(quick.nodes[0].kind).toBe('conclusion')
    expect(execute.nodes).toHaveLength(8)
    expect(execute.nodes[0].kind).toBe('prerequisite')
    expect(full.nodes.length).toBeGreaterThanOrEqual(5)
    expect(full.nodes.length).toBeLessThanOrEqual(12)
  })
})
