import { useEffect, useId, useState } from 'react'

interface MermaidDiagramProps {
  chart: string
}

/** Mermaid 仅在检测到 mermaid 代码块时动态加载，不影响普通文档首屏。 */
export function MermaidDiagram({ chart }: MermaidDiagramProps) {
  const id = useId().replace(/:/g, '-')
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base' })
      const rendered = await mermaid.render(`mermaid-${id}`, chart)
      if (!cancelled) {
        setSvg(rendered.svg)
        setError(null)
      }
    }).catch((renderError: unknown) => {
      if (!cancelled) setError(renderError instanceof Error ? renderError.message : '图表渲染失败')
    })
    return () => { cancelled = true }
  }, [chart, id])

  if (error) return <pre className="my-4 overflow-x-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">Mermaid：{error}</pre>
  if (!svg) return <div className="my-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-xs text-[var(--text-muted)]">正在渲染 Mermaid 图表…</div>
  return <div className="my-5 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--paper)] p-4" dangerouslySetInnerHTML={{ __html: svg }} />
}
