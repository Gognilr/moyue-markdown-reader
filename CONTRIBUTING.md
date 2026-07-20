# 贡献指南

感谢你改进 Markdown 阅读器。项目目前以 Windows 本地优先、轻量和文件可靠性为核心，请优先提交范围明确、可以验证的改动。

## 提交 Issue 前

1. 搜索现有 Issue，确认问题尚未被报告。
2. 使用对应 Issue 模板，并提供 Windows 版本、应用版本、复现步骤和最小 Markdown 样本。
3. 删除样本中的个人信息、密钥、公司内部路径和未授权内容。
4. 安全漏洞不要公开披露，按 [SECURITY.md](SECURITY.md) 报告。

## 本地开发

环境和命令见 [docs/BUILDING.md](docs/BUILDING.md)。本项目以 `npm` 和 `package-lock.json` 为唯一 JavaScript 包管理基线，请不要同时提交其他锁文件。

## Pull Request 要求

- 一个 PR 只解决一个清晰问题；大型功能应先开 Issue 对齐范围。
- 保留现有本地优先和最小权限边界，不要为方便而扩大文件系统或 Shell 权限。
- 用户可见行为变化应更新 README、相关 `docs/` 文档或 `CHANGELOG.md`。
- 修复应附回归测试；原生 Windows 行为还应写明手工验收步骤和结果。
- 不提交 `node_modules`、`dist`、Rust `target*`、安装包、调试符号、个人配置或真实用户文档。
- 不顺带格式化或重写无关文件。

提交前至少运行：

```powershell
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

涉及核心操作时再运行：

```powershell
npm run test:e2e
```

## 提交和评审

建议使用简洁的命令式提交说明，例如 `fix: preserve dirty tab on external refresh`。PR 描述应说明：问题、解决方法、风险、测试证据，以及是否需要 Windows 原生或 Office 视觉验收。

提交贡献即表示你有权提交相关内容，并同意贡献内容按本仓库的 MIT License 发布。
