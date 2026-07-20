# Markdown syntax extension building blocks

`src/features/markdown/syntaxExtensions.ts` is an opt-in, local-only parsing layer for the three reading enhancements that are easy to lose in a generic Markdown renderer:

- `parseFrontMatter(markdown)` returns a conservative key/value summary plus the body to render. It intentionally supports scalar and simple list fields only; it does not evaluate YAML tags or aliases.
- `parseCallouts(markdown)` recognizes GitHub/Obsidian alert blockquotes such as `> [!WARNING] Title` and preserves source lines.
- `parseFootnotes(markdown)` exposes definition text, source line and reference count. `remark-gfm` continues to provide normal inline-footnote rendering.
- `remarkCallouts` turns alert blockquotes into semantic `aside` nodes. Add it after `remark-gfm` in a host-specific `remarkPlugins` array.

The matching presentational components are in `SyntaxExtensions.tsx`: `FrontMatterSummaryCard`, `CalloutAside`, and `FootnoteList`. Their CSS is deliberately a separate opt-in file, `syntaxExtensions.css`.

Example host integration (not wired into the current reader view):

```tsx
const frontMatter = parseFrontMatter(markdown)
const source = frontMatter?.body ?? markdown
<FrontMatterSummaryCard summary={frontMatter} />
<ReactMarkdown remarkPlugins={[remarkGfm, remarkCallouts]} components={{ aside: CalloutAside }}>
  {source}
</ReactMarkdown>
<FootnoteList footnotes={parseFootnotes(source)} />
```

The module is tested as pure parsing/transformation behavior. Integrating it into `MarkdownView` remains a separate UI decision, so this addition does not silently change how existing documents are rendered.
