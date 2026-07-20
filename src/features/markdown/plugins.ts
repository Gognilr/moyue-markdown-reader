// Markdown 渲染管线插件配置
// 安全策略：默认不引入 rehype-raw，react-markdown v9 本身不会渲染原始 HTML，
// 因此已天然防御 markdown 中的 XSS 注入。
// 第二阶段预留：Mermaid (remark-mermaid) / KaTeX (rehype-katex) 扩展点。

import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { remarkCallouts } from './syntaxExtensions'
import type { PluggableList } from 'unified'

/** remark 阶段插件（语法扩展） */
export const remarkPlugins: PluggableList = [remarkGfm, remarkMath, remarkCallouts]

/** rehype 阶段插件（HTML 转换）
 *  - rehypeSlug: 自动为 H1-H6 生成 github 风格的 id，供 TOC 跳转
 *  - rehypeHighlight: 代码块语法高亮
 */
export const rehypePlugins: PluggableList = [
  rehypeSlug,
  [rehypeHighlight, { detect: true, ignoreMissing: true }],
  rehypeKatex,
]

/* —— 第二阶段预留扩展点（暂不启用） ——
 * import remarkMermaid from 'remark-mermaid'
 * import rehypeKatex from 'rehype-katex'
 * import remarkMath from 'remark-math'
 */
