// 统一的 TypeScript 类型声明

/** 应用主题类型 */
export type AppTheme = 'paper' | 'light' | 'dark'

/** 编辑/阅读模式 */
export type ViewMode = 'read' | 'edit'

/** 历史记录单条条目 */
export interface HistoryItem {
  /** 本地绝对路径 */
  path: string
  /** 文件名（去除 .md 后缀） */
  title: string
  /** 最后打开时间戳 */
  lastOpenedAt: number
  /** 是否被收藏 */
  isFavorite: boolean
  /** 滚动百分比 (0 ~ 1) */
  scrollPositionRatio: number
  /**
   * A compact, non-cryptographic snapshot of the last content we read or
   * saved.  It is used only to rank an explicit relocation recovery request;
   * it is never sent off-device.
   */
  contentFingerprint?: {
    version: 1
    hash: string
    characters: number
    lines: number
  }
  /** Earlier locations retained after an explicitly confirmed move. */
  previousPaths?: string[]
}

/** 目录项 */
export interface TocItem {
  /** 与渲染后 heading 元素 id 一致 */
  id: string
  /** 标题文本 */
  text: string
  /** 标题层级 1~4 */
  level: number
}

/** 持久化存储的数据结构 */
export interface PersistData {
  history: HistoryItem[]
  theme: AppTheme
  recoveryDraft?: RecoveryDraft
  layout?: LayoutPreferences
}

/** 未保存草稿，只用于崩溃后的显式恢复，绝不直接覆盖源文件。 */
export interface RecoveryDraft {
  path: string | null
  content: string
  updatedAt: number
}

export interface LayoutPreferences {
  /** CSS font stack used by the reading surface; local presentation only. */
  fontFamily: string
  fontSize: number
  lineHeight: number
  contentWidth: number
  /** Extra tracking for dense technical text, in em. */
  letterSpacing: number
  /** Paragraph separation, in em. */
  paragraphSpacing: number
  /** Presentation-only vertical layout; this never changes Markdown source. */
  isVerticalReading: boolean
  isSidebarOpen: boolean
  isTocOpen: boolean
}

/** Deliberately small set of reading presets; a preset never changes the source document. */
export type ReadingLayoutPreset = 'comfortable' | 'compact' | 'spacious'

export interface ReadingPersonalitySuggestion {
  kind: 'readme' | 'technical' | 'minutes' | 'longform' | 'report'
  preset: ReadingLayoutPreset
  confidence: 'high' | 'medium'
  reason: string
}

/** A named typography treatment. Pins only affect presentation, never Markdown. */
export type DocumentTypographyPersonality = 'readme' | 'report' | 'paper' | 'book' | 'minutes'

export type DocumentPersonalityScope = 'document' | 'kind'

export interface DocumentPersonalityPin {
  personality: DocumentTypographyPersonality
  scope: DocumentPersonalityScope
  /** Absolute document key for document pins, or a stable kind such as `technical`. */
  target: string
  updatedAt: number
}

/** 不写回 Markdown 的稳定文本锚点。 */
export interface TextAnchor {
  quote: string
  prefix: string
  suffix: string
  headingPath: string[]
}

export type AnnotationKind = 'highlight' | 'underline' | 'bookmark' | 'note'

export interface Annotation {
  id: string
  kind: AnnotationKind
  anchor: TextAnchor
  note?: string
  createdAt: number
  updatedAt: number
}

/** 摘录保留原文锚点与采集时的上下文，不依赖原 Markdown 被修改。 */
export interface Excerpt {
  id: string
  content: string
  anchor: TextAnchor
  createdAt: number
}

export interface DocumentAnnotations {
  version: 1
  documentKey: string
  annotations: Annotation[]
  excerpts: Excerpt[]
  updatedAt: number
}

/** A user's current reason for reading.  It deliberately does not imply AI. */
export type ReadingPurpose = 'quick-overview' | 'execution-decision' | 'follow-steps' | 'complete-reading'

/** Time available for one Cognitive Route session. */
export type ReadingBudget = 5 | 15 | 'full'

export type CognitiveBlockKind = 'prerequisite' | 'conclusion' | 'evidence' | 'risk' | 'step'

/** Stable, renderer-independent source pointer used by routes and future reading memory. */
export interface BlockAnchor {
  id: string
  contentFingerprint: string
  headingPath: string[]
  previousFingerprint?: string
  nextFingerprint?: string
  blockType: string
}

export interface CognitiveBlock {
  anchor: BlockAnchor
  kind: CognitiveBlockKind
  text: string
  /** Rule signal retained so every classification is explainable. */
  reason: string
}

export interface CognitiveRouteNode {
  id: string
  kind: CognitiveBlockKind
  title: string
  explanation: string
  source: BlockAnchor
}

export interface CognitiveRoute {
  purpose: ReadingPurpose
  budget: ReadingBudget
  nodes: CognitiveRouteNode[]
}

/** A non-blocking diagnostic found while inspecting a Markdown document. */
export type DocumentDiagnosticSeverity = 'info' | 'warning'

export type DocumentDiagnosticCode =
  | 'relative-image'
  | 'relative-link'
  | 'heading-level-jump'
  | 'duplicate-anchor'
  | 'wide-table'
  | 'remote-resource'
  | 'missing-local-resource'
  | 'oversized-image'
  | 'suspicious-encoding'
  | 'export-font-coverage'
  | 'unsupported-export-syntax'

export interface DocumentDiagnostic {
  id: string
  code: DocumentDiagnosticCode
  severity: DocumentDiagnosticSeverity
  /** One-based source line, retained even when there is no editor mounted. */
  line: number
  column: number
  description: string
  fixHint: string
  /** Relative resources are pending until a caller supplies an inventory. */
  resolution?: 'pending' | 'resolved'
}

export interface DocumentHealthReport {
  diagnostics: DocumentDiagnostic[]
  checkedAt: number
}

/** Native, non-recursive metadata for one Markdown resource reference. */
export interface LocalResourceInventoryItem {
  /** The exact URL as authored in Markdown, so health diagnostics can key by it. */
  reference: string
  exists: boolean
  byteLength?: number
  /** Extension-based classification only; no image decoder is invoked. */
  isImage: boolean
}

/** A local Markdown reference discovered in the currently open document. */
export interface ProjectDocumentLink {
  /** Label authored in the Markdown link. */
  label: string
  /** Absolute (or browser-relative) path resolved from the current document. */
  path: string
  /** Optional heading fragment, without the leading #. */
  fragment?: string
}

/** Minimal, in-memory navigation state for zero-configuration project reading. */
export interface ProjectRoamState {
  currentPath: string
  backStack: string[]
  links: ProjectDocumentLink[]
}

/** A semantic checkpoint recorded locally when a reader leaves a document. */
export interface ReadingRecoveryCapsule {
  version: 2
  documentKey: string
  heading: string | null
  /** A small quote around the reading position; never changes the source file. */
  nearbyText: string
  textFingerprint: string
  scrollRatio: number
  durationMs: number
  pendingTaskCount: number
  collapsedSections: string[]
  layout?: LayoutPreferences
  /** The reader-selected route goal active when this checkpoint was created. */
  readingPurpose?: ReadingPurpose
  /** The most recent explicit judgement. It is never inferred from scroll position. */
  lastUnderstanding: RecoveryUnderstandingSnapshot | null
  /** Explicitly marked questions or pending-verification items, capped for a compact prompt. */
  unresolvedQuestions: string[]
  /** Whole-document fingerprint used only to disclose that the source changed before recovery. */
  documentFingerprint: string
  updatedAt: number
}

export interface RecoveryUnderstandingSnapshot {
  state: 'understood' | 'questioned' | 'skipped' | 'disagreed'
  heading: string | null
  note?: string
}

export type DocumentLensCategory = 'definition' | 'conclusion' | 'evidence' | 'risk' | 'step'
export type DocumentLensFilter = 'all' | 'conclusion' | 'action' | 'risk' | 'command' | 'data'

/** A source-backed deterministic extract. Categories may overlap without changing the original Markdown. */
export interface DocumentLensItem {
  id: string
  line: number
  text: string
  headingPath: string[]
  categories: DocumentLensCategory[]
  facets: Array<'action' | 'command' | 'data'>
  reason: string
}

/** A deliberately small unit of document state for the reader's tab strip. */
export interface DocumentTab {
  /** Stable within one app session. File-backed tabs use their normalized path. */
  id: string
  path: string | null
  title: string
  content: string
  /** Content last known to be persisted. It is used to derive dirty state. */
  savedContent: string
  isDirty: boolean
  undoStack: string[]
  redoStack: string[]
}

/** A local-only unit of intentional reading. It never owns or changes source files. */
export interface ReadingTaskDocument {
  /** File path when available, otherwise a stable in-session tab id. */
  key: string
  path: string | null
  title: string
  completedAt: number | null
}

/** Persisted locally in this device's reader storage; no account or network is involved. */
export interface ReadingTask {
  version: 1
  id: string
  purpose: string
  budgetMinutes: number
  expectedResult: string
  documents: ReadingTaskDocument[]
  result: string
  createdAt: number
  updatedAt: number
}

export type TabCloseDisposition =
  | { kind: 'close' }
  | { kind: 'confirm-discard'; tab: Pick<DocumentTab, 'id' | 'title' | 'path'> }
  | { kind: 'missing' }
