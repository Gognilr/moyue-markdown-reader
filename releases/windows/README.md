# Windows 便捷安装包

此目录提供可直接下载运行的 Windows x64 安装包。

- `墨阅Markdown阅读器_1.0.0_x64-setup.exe`：当前随仓库附带的便捷体验包。
- 它可能落后于 `main` 分支；如需最新代码，请拉取仓库后自行构建。
- 正式稳定版本及 SHA-256 校验值将发布在 GitHub Releases。

当前随仓库附带包的 SHA-256：`449756DEB68DC5E0F5583277879AA99B05146D092BA6A76733BAD1CF10FA5FBD`。

构建命令：

```powershell
npm ci
npm run tauri build -- --bundles nsis
```
