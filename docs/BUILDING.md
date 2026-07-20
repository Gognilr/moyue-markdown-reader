# 构建与验证

## 支持环境

当前构建与验收基线为 Windows 10/11 x64。

需要安装：

- Node.js 20 或更高版本；
- npm 10；
- Rust stable，目标 `x86_64-pc-windows-msvc`；
- Visual Studio Build Tools（Desktop development with C++）与 Windows SDK；
- Microsoft Edge 与 WebView2 Runtime；
- 可选：Microsoft Word（DOCX 视觉验收）、Poppler（PDF 页面渲染）。

## 安装依赖

```powershell
npm ci
rustup toolchain install stable
rustup default stable-msvc
```

项目只维护 `package-lock.json`。不要用 `npm install` 无意更新锁文件后连同功能 PR 一起提交。

## 开发

```powershell
npm run tauri dev
```

只调试浏览器层时可以运行 `npm run dev`，但该模式不能验证文件关联、系统对话框、文件监听、原子替换或窗口关闭。

## 验证

```powershell
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
```

统一命令：

```powershell
npm run test:core
```

Playwright 配置使用本机 Microsoft Edge。原生行为还应按照 [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) 在 Windows 实机完成。

## 构建 NSIS 安装包

```powershell
npm run tauri build -- --bundles nsis
```

默认输出位于：

```text
src-tauri/target/release/bundle/nsis/
```

`src-tauri/target*`、安装包和 PDB 均被 `.gitignore` 排除。发布时应将安装包作为 GitHub Release 附件上传，而不是提交到 Git 历史。

## 发布前哈希与签名

```powershell
Get-FileHash .\path\to\setup.exe -Algorithm SHA256
Get-AuthenticodeSignature .\path\to\setup.exe
```

如果没有代码签名证书，Release Notes 必须明确说明安装包未签名，不得暗示已验证发布者身份。
