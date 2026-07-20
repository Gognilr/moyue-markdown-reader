# 墨阅Markdown阅读器

一个面向 Windows 的本地优先 Markdown 阅读器与轻量记事本。默认以干净的阅读视图打开文档，同时保留可靠编辑、原生文件会话、打印和文档导出能力。

[English](README.en.md) · [构建指南](docs/BUILDING.md) · [隐私说明](docs/PRIVACY.md) · [贡献指南](CONTRIBUTING.md)

## 特点

- 本地优先：阅读和编辑 Markdown 不需要账号或云服务，正文默认不会上传。
- 稳定文件会话：支持选择、拖入、文件关联、历史记录、多页签、原子保存、未保存保护和外部修改冲突处理。
- 丰富渲染：支持 GFM 表格、任务列表、数学公式、Mermaid、代码高亮、本地图片、脚注与扩展语法。
- 长文阅读：大文件采用分段渲染和目录窗口化，降低内存占用并保持滚动响应。
- 原生 Windows 集成：`.md/.markdown` 文件关联、最近/收藏 Jump List，以及可选的资源管理器右键快速预览。
- 导出与打印：隔离打印正文，可导出 DOCX、PDF 和当前表格 XLSX；DOCX/PDF 支持本地图片、中文字体和宽表分页。

## 当前平台

当前正式支持 Windows 10/11 x64。应用基于 Tauri 2、React 18、TypeScript 和 Rust。其他平台尚未完成原生行为和视觉验收。

## 下载

正式发布后，请从仓库的 GitHub Releases 页面下载安装包。请核对 Release 中公布的 SHA-256。当前自动生成的 Windows 安装包尚未进行商业代码签名，Windows 可能显示发布者未知提示。

## 从源码运行

需要：

- Node.js 20+
- npm 10+
- Rust stable（MSVC toolchain）
- Microsoft C++ Build Tools 与 Windows SDK
- WebView2 Runtime（Windows 10/11 通常已安装）

```powershell
npm ci
npm run tauri dev
```

生产构建：

```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri build -- --bundles nsis
```

更完整的环境与命令见 [docs/BUILDING.md](docs/BUILDING.md)。

## 测试

```powershell
# Vitest 单元与服务测试
npm test

# Microsoft Edge 核心端到端流程
npm run test:e2e

# 前端 + E2E + Rust 原生边界
npm run test:core
```

文件关联、外部修改、系统保存对话框、打印预览、安装升级和卸载仍应在 Windows 实机验证，浏览器测试不能替代这些检查。

## 安全与隐私

应用只在用户选择或系统文件关联授权的文档目录内读取 Markdown 与明确引用的本地资源；导出只写入用户选择的目标。详细边界见 [docs/security-scope.md](docs/security-scope.md) 和 [docs/PRIVACY.md](docs/PRIVACY.md)。

请不要在公开 Issue 中披露漏洞利用细节，参见 [SECURITY.md](SECURITY.md)。

## 项目状态

核心功能已达到 1.0.0 本地验收基线。详细历史计划和验证证据保留在 [list.md](list.md) 与 [核心完善执行计划-2026-07-19.md](核心完善执行计划-2026-07-19.md)。这些文件是工程记录，不代表所有路线图增强都已实现。

已知技术债：当前依赖审计仍包含 Mermaid/KaTeX 传递依赖告警，升级需要配套公式与图表视觉回归；详见[开源发布检查表](docs/OPEN_SOURCE_RELEASE_CHECKLIST.md)。

## 参与贡献

欢迎 Bug 报告、文档改进和范围清晰的 Pull Request。开始前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 许可证

项目采用 [MIT License](LICENSE)。第三方组件仍适用各自许可证，摘要见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
