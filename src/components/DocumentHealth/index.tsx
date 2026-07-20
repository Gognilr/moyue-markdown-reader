import type { DocumentDiagnostic, DocumentHealthReport } from '../../types'

const severityLabel = { info: 'Info', warning: 'Needs attention' } as const

/** Standalone, quiet diagnostics panel. The host decides when it is shown. */
export function DocumentHealthPanel({ report, onSelect }: { report: DocumentHealthReport; onSelect?: (diagnostic: DocumentDiagnostic) => void }) {
  if (!report.diagnostics.length) return null

  return <section aria-label="Document health" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <header className="mb-2 flex items-center justify-between gap-3">
      <h2 className="font-semibold">Document health</h2>
      <span className="text-xs">{report.diagnostics.length} issue{report.diagnostics.length === 1 ? '' : 's'}</span>
    </header>
    <ul className="space-y-2">
      {report.diagnostics.map((item) => <li key={item.id}>
        <button type="button" className="w-full rounded-md px-2 py-1 text-left hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500" onClick={() => onSelect?.(item)}>
          <span className="mr-2 text-xs font-medium">{severityLabel[item.severity]} · line {item.line}</span>
          <span>{item.description}</span>
          <span className="mt-1 block text-xs text-amber-800">Suggestion: {item.fixHint}</span>
        </button>
      </li>)}
    </ul>
  </section>
}
