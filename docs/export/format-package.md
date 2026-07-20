# 格式包与自包含 HTML

`src/features/format-package` 提供不依赖浏览器 DOM、Tauri 或 ZIP 库的两层能力：

- `markdownToStandaloneHtml` / `documentIrToStandaloneHtml`：由现有 DocumentIR 渲染单文件 HTML，内嵌基础排版 CSS，保留标题、段落、列表、任务、代码、表格、图片和链接结构。
- `buildFormatPackage`：返回待写入的文件映射，而不是虚报已生成 ZIP。映射固定包含 `<name>.md` 与 `<name>.html`；传入批注时额外包含 `<name>.mdreader.json`。

图片和链接 URL 按原文保留，故相对资源可在与原 Markdown 相同的目录结构中继续解析；该纯模块不会复制资源或擅自改写 URL。未来桌面端或引入 ZIP 依赖后，应将 `FormatPackage.entries` 逐项物化，并在完成写入后才提示“已打包”。

## 下载控制与开放文件映射

`formatPackageDownload.ts` 在上述纯映射之上增加了可复用的下载边界：

- `buildStandaloneHtmlDownload` / `downloadStandaloneHtml` 生成并下载一个 `.html` 文件。HTML 内嵌排版 CSS；它不会下载、内嵌或改写相对图片和链接。
- `buildFormatPackageFileMap` / `formatPackageToFileMap` 把格式包公开为 `{ [path]: FormatPackageEntry }`，方便桌面端保存对话框、插件或调用方选择其中某一个文件。
- `downloadFormatPackageEntries` 使用注入的 `DownloadAdapter` 逐项下载 Markdown、HTML 和可选批注 sidecar；它**不是 ZIP 导出**，也不会声称已经打包。浏览器默认适配器只触发普通文件下载，桌面端可以替换为原生保存逻辑。

因此当前可交付的是单文件 HTML 下载与格式包的开放文件映射；资源收集、目录物化和 ZIP 归档仍是后续工作，完成真实归档后才能向用户提示“已打包”。

工具栏还提供受限的反向流程：只可选择 `.mdpack.zip`。浏览器通过 `input[type=file]` 读取字节；桌面端由原生选择器直接读入字节且不扩展文件系统授权。导入器仅接受本应用 `md-reader.open-package` v1 的 UTF-8、单盘、未压缩 Store ZIP，并验证中央目录、本地记录、CRC32、大小和条目上限、无重复/目录穿越路径，以及 manifest 与文件清单一一对应。内容不会落盘；Markdown 中显式声明的相对资源仅在当前会话改写为 Blob URL，并在切换或退出时释放。该能力不是 ZIP 文件关联，双击 `.mdpack.zip` 启动仍未实现。
