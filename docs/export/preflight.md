# P3 导出预检

`preflightExport(document, options)` 是 DOCX/PDF 后端之前的纯函数关卡。它只读取 `DocumentIR` 和可选的原始 Markdown，不访问网络、DOM 或文件系统，因此同一输入总会产生同一份报告。

检测项：

- A（确定）：空、不安全或在调用方附件清单中缺失的资源，会阻塞导出；
- B（需要确认）：远程资源及最小列宽超过页面可用宽度的表格；
- C（兼容性提示）：原始 Markdown 中无法进入 `DocumentIR` 的 HTML 标签。

报告中的每项都带有位置、严重性和可执行的建议。调用方可传入 `hasLocalResource` 连接真实附件清单，传入 `sourceMarkdown` 检查 HTML，并可通过 `tableLayout.availableWidth` 使用目标纸张的可用字符宽度。

`ExportPreflightPanel` 是独立展示组件；它不负责运行导出、不读应用状态，也不修改文档。

## 导出前处置

每个问题另有独立于 A/B/C 可信度的处置状态：

- **已自动修复**：当前为不受 `DocumentIR` 支持的原始 HTML；它仅从本次导出的语义副本排除，面板会列出并允许取消该自动处置。
- **需要选择**：远程资源与超宽表必须显式选择。本地可选择保留远程引用，或仅在导出副本中省略它；表格必须确认后端策略，而不会静默裁切。
- **无法保证**：空、不安全或清单中缺失的本地资源仍会阻止导出。

`ExportPreflightResolutionState` 只保存一次导出尝试的选择。`applyExportOnlyResolutions` 生成新的 `DocumentIR`：选择“省略”时移除远程图片、将远程链接还原为可读文字；源 Markdown 和编辑器状态不被修改。撤销自动修复也只是变更该临时状态。
