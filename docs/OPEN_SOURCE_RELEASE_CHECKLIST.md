# GitHub 开源发布检查表

## 已完成的仓库材料

- [x] 中英文 README。
- [x] MIT License（版权持有人暂记为 `Tabbit`）。
- [x] CONTRIBUTING、CODE_OF_CONDUCT、SECURITY、CHANGELOG。
- [x] 隐私说明、构建指南、第三方依赖摘要。
- [x] Bug/功能 Issue 表单与 Pull Request 模板。
- [x] Windows CI 与 Dependabot 配置。
- [x] `.gitignore` 排除约 10.5GB Rust 缓存、Node 依赖、前端构建、安装包和调试符号。
- [x] 常见密钥模式和用户绝对路径扫描无命中。

## 创建公开仓库前必须由维护者确认

- [ ] 确认许可证确实选择 MIT，且 `Copyright (c) 2026 Tabbit` 是希望公开的版权声明。
- [ ] 确认仓库名称、GitHub 账号/组织和公开简介。
- [ ] 检查应用名称、图标、`com.tabbit.mdreader` 标识及 `Tabbit` 名称不存在未解决的商标或归属问题。
- [ ] 确认 `test-artifacts/` 中所有图片、PDF、DOCX、XLSX 和 Markdown 样本可公开再分发。
- [ ] 决定是否公开内部计划文件：`list.md`、`剩余工作清单.md`、`核心完善执行计划-2026-07-19.md`、`AI时代Markdown阅读器原创创新设计.md`、`markdown_reader_prompt.md`。
- [ ] 在 GitHub 仓库 Settings → Security 中启用 Private vulnerability reporting。
- [ ] 配置默认分支保护：PR、CI 必须通过、禁止 force push。

## 发布 1.0.0 前

- [ ] 处理或正式接受 `npm audit --omit=dev` 的 Mermaid/KaTeX 依赖告警；当前基线为 `1 high / 8 moderate`。
- [ ] 运行 `npm ci`、`npm test`、`npm run build`、`npm run test:e2e`、`cargo test` 和最终 NSIS 构建。
- [ ] 在干净 Windows 用户环境完成安装、文件关联、保存、打印、升级、卸载和重装。
- [ ] 为安装包生成 SHA-256 并写入 Release Notes。
- [ ] 若未签名，在 README 与 Release Notes 明确标注；若签名，核对 Authenticode 状态和时间戳。
- [ ] 创建 `v1.0.0` 标签和 GitHub Release，把安装包作为附件上传，不提交进 Git 历史。

### 2026-07-20 本地准备证据

- `npm test`：75 个测试文件、221 项测试通过。
- `npm run test:e2e`：5 条 Microsoft Edge 核心场景通过。
- `npm run build`：通过；仍有大分包与动态/静态重复导入警告，未当作性能验收完成。
- `cargo test --manifest-path src-tauri/Cargo.toml`：20 项测试通过。
- `npm audit --omit=dev --registry=https://registry.npmjs.org/`：1 high / 8 moderate，尚未关闭。
- NSIS 候选安装包：5,460,137 bytes，SHA-256 `AF4DAB44102B570658923E309CC47FEAAA1E583623D6696E4EE92BF66C4A29A8`，Authenticode 状态 `NotSigned`。
- 本轮已运行完整核心回归并重新打包，但尚未完成干净机安装及重启后历史文件授权恢复验收，因此上述证据不能替代正式发布验收。

## 建议的仓库元数据

- Description：`Local-first Markdown reader and lightweight notepad for Windows, built with Tauri, React and Rust.`
- Topics：`markdown`、`markdown-reader`、`windows`、`tauri`、`react`、`rust`、`local-first`、`docx`、`pdf`
- Website：暂留空，直到有正式主页或文档站。
