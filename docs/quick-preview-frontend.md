# 快速预览前端契约

`src/features/quick-preview/QuickPreviewRuntime.tsx` 是 P4 原生快速预览的前端入口。把它挂载在应用根部一次即可；普通主窗口和浏览器开发环境保持无操作。

在 Rust 创建的 `markdown-quick-preview` 窗口中，它会先读取 `preview_markdown_path`，再监听 `markdown-preview:open-file`，因此不会丢失 WebView 启动前发送的文件事件。内容写入该窗口自己的 Zustand 状态，不调用 `openDocument`，也不会写入正常阅读器的最近文件历史。

- `Esc` 调用 `close_markdown_preview`，只关闭预览窗口。
- `Enter` 调用 `promote_markdown_preview`，移除无边框、置顶和任务栏隐藏状态。
- 有修饰键的按键以及输入控件中的 `Enter` 不会被劫持。
- Web 环境不会导入或调用 Tauri API；`openQuickPreview()` 返回 `null`。

这只是应用内原生窗口的前端适配，**不表示已实现资源管理器的全局空格预览快捷键**。该入口仍需在目标 Windows 环境与资源管理器集成方案一并验证。
