import { useState } from 'react'
import { codeLineNumberWidth, codeLines } from './codeBlockModel'

type CodeBlockProps = {
  className?: string
  code: string
}

function getLanguage(className?: string) {
  const match = className?.match(/language-([^\s]+)/)
  return match?.[1] ?? 'text'
}

/** 带复制和换行开关的代码块展示组件。 */
export function CodeBlock({ className, code }: CodeBlockProps) {
  const [wrapLines, setWrapLines] = useState(false)
  const [copied, setCopied] = useState(false)
  const language = getLanguage(className)
  const lines = codeLines(code)
  const lineNumberWidth = codeLineNumberWidth(lines.length)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  return (
    <section className="code-block" aria-label={`${language} 代码块`}>
      <header className="code-block__toolbar">
        <span className="code-block__language">{language}</span>
        <span className="code-block__actions">
          <button type="button" onClick={() => setWrapLines((value) => !value)}>{wrapLines ? '不换行' : '自动换行'}</button>
          <button type="button" onClick={copy}>{copied ? '已复制' : '复制'}</button>
        </span>
      </header>
      <pre className={wrapLines ? 'code-block__content code-block__content--wrap' : 'code-block__content'}>
        <code className={className}>
          {lines.map((line, index) => (
            <span className="code-block__line" key={index}>
              <span className="code-block__line-number" aria-hidden="true" style={{ minWidth: `${lineNumberWidth}ch` }}>{index + 1}</span>
              <span className="code-block__line-content">{line || ' '}</span>
            </span>
          ))}
        </code>
      </pre>
    </section>
  )
}
