import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import { parseCallouts, parseFootnotes, parseFrontMatter, remarkCallouts } from './syntaxExtensions'
import { FootnoteList } from './MarkdownSyntaxExtensions'
import { remarkPlugins } from './plugins'

describe('Markdown syntax extensions', () => {
  it('parses a safe front matter summary and preserves the render body', () => {
    const result = parseFrontMatter('---\ntitle: "Release notes"\ntags:\n  - docs\n  - v1\n---\n# Body')
    expect(result).toMatchObject({ fields: { title: 'Release notes', tags: ['docs', 'v1'] }, body: '# Body', lineCount: 6 })
  })

  it('does not mistake a normal thematic rule for front matter', () => {
    expect(parseFrontMatter('---\n# A document')).toBeNull()
  })

  it('finds callout ranges without consuming an adjacent paragraph', () => {
    expect(parseCallouts('> [!WARNING] Rollback\n> Keep the old build.\n\nNext.')).toEqual([{ kind: 'warning', title: 'Rollback', body: 'Keep the old build.', startLine: 1, endLine: 2 }])
  })

  it('extracts multiline footnotes and counts only references', () => {
    expect(parseFootnotes('See [^a] and [^a].\n[^a]: First line\n  continuation')).toEqual([{ id: 'a', text: 'First line continuation', startLine: 2, referenceCount: 2 }])
  })

  it('turns an alert blockquote into a semantic aside node for a renderer', () => {
    const tree = { type: 'root', children: [{ type: 'blockquote', children: [{ type: 'paragraph', children: [{ type: 'text', value: '[!TIP] Keep it local' }] }] }] }
    remarkCallouts()(tree)
    expect(tree.children[0]).toMatchObject({ data: { hName: 'aside', hProperties: { 'data-callout': 'tip', 'data-callout-title': 'Keep it local' } } })
  })

  it('keeps GFM footnote anchors and exposes an accessible return control in the reusable navigator', () => {
    const markdown = 'See [^a] and [^a].\n\n[^a]: First note.'
    const gfmHtml = renderToStaticMarkup(React.createElement(ReactMarkdown, { remarkPlugins }, markdown))
    const navigatorHtml = renderToStaticMarkup(React.createElement(FootnoteList, {
      footnotes: parseFootnotes(markdown),
      onOpenSource: () => undefined,
      onReturnToReference: () => undefined,
    }))
    expect(gfmHtml).toContain('id="user-content-fnref-a"')
    expect(gfmHtml).toContain('data-footnote-backref=""')
    expect(navigatorHtml).toContain('aria-label="Footnote navigation"')
    expect(navigatorHtml).toContain('aria-label="Return to the first reference for footnote a"')
  })
})
