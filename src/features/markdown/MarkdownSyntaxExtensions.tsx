import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import type { CalloutBlock, FootnoteDefinition, FrontMatterSummary } from './syntaxExtensions'

/** Presentational opt-in components for a host's ReactMarkdown component map. */
export function FrontMatterSummaryCard({ summary }: { summary: FrontMatterSummary }) {
  const entries = Object.entries(summary.fields).filter(([, value]) => Array.isArray(value) ? value.length : value)
  if (!entries.length) return null
  return <section className="front-matter-summary" aria-label="Document metadata">
    <h2>Document metadata</h2>
    <dl>{entries.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(', ') : value}</dd></div>)}</dl>
  </section>
}

export function Callout({ kind, title, children, ...props }: ComponentPropsWithoutRef<'aside'> & Pick<CalloutBlock, 'kind' | 'title'> & { children: ReactNode }) {
  return <aside {...props} className={`markdown-callout markdown-callout--${kind} ${props.className ?? ''}`.trim()} data-callout={kind}>
    <strong className="markdown-callout__title">{title}</strong><div className="markdown-callout__body">{children}</div>
  </aside>
}

export function FootnoteList({ footnotes, onOpenSource, onReturnToReference }: {
  footnotes: FootnoteDefinition[]
  onOpenSource?: (footnote: FootnoteDefinition) => void
  onReturnToReference?: (footnote: FootnoteDefinition) => void
}) {
  if (!footnotes.length) return null
  return <nav className="markdown-footnotes" aria-label="Footnote navigation">
    <h2>Footnote navigation</h2>
    <ol>{footnotes.map((footnote) => <li key={footnote.id}>
      <button type="button" onClick={() => onOpenSource?.(footnote)} aria-label={`Open footnote ${footnote.id} definition at line ${footnote.startLine}`}><sup>{footnote.id}</sup> {footnote.text}</button>
      {onReturnToReference && <button type="button" className="markdown-footnotes__return" onClick={() => onReturnToReference(footnote)} aria-label={`Return to the first reference for footnote ${footnote.id}`}>Return to reference</button>}
      {footnote.referenceCount > 1 && <span aria-label={`${footnote.referenceCount} references`}> ×{footnote.referenceCount}</span>}
    </li>)}</ol>
  </nav>
}

/** An adapter for react-markdown: read `data-callout` values from remarkCallouts. */
export function CalloutAside(props: ComponentPropsWithoutRef<'aside'>) {
  const dataProps = props as ComponentPropsWithoutRef<'aside'> & Record<string, unknown>
  const kind = String(dataProps['data-callout'] ?? 'note')
  const title = String(dataProps['data-callout-title'] ?? kind)
  return <Callout {...props} kind={kind} title={title}>{props.children}</Callout>
}
