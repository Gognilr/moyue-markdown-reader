# 发布检查清单

## 构建

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] 安装 Rust stable、Windows C++ Build Tools 与 WebView2 Runtime。
- [ ] `npm run tauri build`

## 文件可靠性

- [ ] 修改后分别测试打开、新建、历史切换、关闭窗口，确认保存、放弃和取消路径正确。
- [ ] 用 VS Code 或记事本修改当前文件，确认自动刷新及冲突提示正确。
- [ ] 在保存期间确认临时文件不会残留，保存后文件内容正确。
- [ ] 人为终止应用，重启后确认草稿可恢复且源文件未被自动覆盖。
- [ ] 拖入 `.md` 与 `.markdown` 文件；双击文件关联启动后确认路径正确传入。

## 安全与安装

- [ ] 审核 `src-tauri/capabilities/default.json` 的文件范围，仅保留产品所需权限。
- [ ] 验证外部链接只交给系统浏览器，Markdown 原始 HTML 不执行。
- [ ] 在干净 Windows 虚拟机验证安装、升级、卸载和文件关联恢复。
