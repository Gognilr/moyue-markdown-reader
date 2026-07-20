/**
 * Export pagination contract for Markdown tables.
 *
 * Ordinary rows are atomic: an exporter moves the whole row to the next page
 * instead of cutting its cells in two.  A row which is physically taller than
 * a printable page is the one unavoidable exception.  It is emitted as
 * labelled continuation fragments, with the table header repeated, so an
 * export never produces clipped/off-page table content.
 */
export const TABLE_PAGINATION_POLICY = {
  repeatHeader: true,
  keepOrdinaryRowsTogether: true,
  oversizedRowFallback: 'continue-across-pages' as const,
} as const

export type TableRowPagination = 'keep-together' | 'continuation'

export interface TablePaginationNotice {
  tableIndex: number
  rowIndex: number
  message: string
}

/** Shared, serialisable metadata used by DOCX plans and the PDF paginator. */
export function tablePaginationMetadata() {
  return {
    headerRepeat: TABLE_PAGINATION_POLICY.repeatHeader,
    cantSplitOrdinaryRows: TABLE_PAGINATION_POLICY.keepOrdinaryRowsTogether,
    oversizedRowFallback: TABLE_PAGINATION_POLICY.oversizedRowFallback,
  }
}
