# 墨阅Markdown阅读器 v1.0.0（候选发布说明）

> 这是 GitHub Release 草稿。依赖安全告警、签名和干净 Windows 环境验收关闭前，请勿标记为正式稳定版。

## 概览

墨阅Markdown阅读器是一款面向 Windows 的本地优先 Markdown 阅读与轻量编辑工具，基于 Tauri、React 与 Rust 构建。文档读取、编辑和导出默认在本机完成。

## 主要能力

- 打开、拖放和关联 `.md` / `.markdown` 文件。
- Markdown 阅读、轻量编辑、目录导航和多标签页。
- 本地图片、数学公式、代码块、表格和 Mermaid 图表渲染。
- 导出 DOCX、PDF、XLSX、独立 HTML 与开放 ZIP 格式包。
- 打印、阅读进度恢复、历史记录和 Windows 外壳集成。

## 下载

- Windows x64 NSIS 安装包：`墨阅Markdown阅读器_1.0.0_x64-setup.exe`
- 文件大小：5,601,464 bytes
- SHA-256：`CACFA361DA9AA58870B7E29020F077E986D24C1B9290ED493042AE921D5E9A58`

校验示例：

```powershell
Get-FileHash -Algorithm SHA256 .\墨阅Markdown阅读器_1.0.0_x64-setup.exe
```

## 重要提示

- 当前安装包未进行 Authenticode 代码签名，Windows 可能显示 SmartScreen 警告。
- 当前仅以 Windows 桌面版为主要支持目标。
- 发布候选仍有 1 项 high、8 项 moderate 的 npm 传递依赖告警，主要来自 Mermaid/KaTeX 依赖链；修复需完成公式和图表视觉回归。
- 大文件内存占用、打开速度、滚动性能及 DOCX/PDF 复杂文档视觉一致性仍需真实环境验收。

## 当前自动化验证

- Vitest：75 个测试文件、220 项测试通过。
- Microsoft Edge 端到端：5 条核心场景通过。
- Rust：20 项测试通过。
- 前端生产构建通过。

上述结果不包含本候选包的干净机安装、升级、卸载、文件关联及最终端到端验收。

## 反馈问题

提交 Issue 时，请附上 Windows 版本、应用版本、复现步骤、实际结果、预期结果和必要截图。涉及私密文档时，请使用可公开的最小复现样本，不要上传原始敏感文件。
