import { useMemo } from 'react'
import { compareMarkdownDocuments, type CompareEntry, type CompareOptions, type DocumentCompareModel } from '../../features/render-diff/documentCompare'
import { DocumentCompareView } from './DocumentCompareView'

export interface RenderDiffPanelProps extends CompareOptions {
  /** Earlier local Markdown content. It is never persisted or written by this component. */
  leftMarkdown: string
  /** Current local Markdown content. It is never persisted or written by this component. */
  rightMarkdown: string
  onSelectEntry?: (entry: CompareEntry) => void
  className?: string
}

export function deriveRenderDiffModel({ leftMarkdown, rightMarkdown, leftLabel, rightLabel, tableKeyColumn }: RenderDiffPanelProps): DocumentCompareModel {
  return compareMarkdownDocuments(leftMarkdown, rightMarkdown, { leftLabel, rightLabel, tableKeyColumn })
}

/** Ready-to-use local comparison panel with no file, history, or network side effects. */
export function RenderDiffPanel(props: RenderDiffPanelProps) {
  const { onSelectEntry, className } = props
  const model = useMemo(
    () => deriveRenderDiffModel(props),
    [props.leftMarkdown, props.rightMarkdown, props.leftLabel, props.rightLabel, props.tableKeyColumn],
  )
  return <DocumentCompareView model={model} onSelectEntry={onSelectEntry} className={className} />
}
