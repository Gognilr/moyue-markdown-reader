# 桌面文件与资源权限边界

## 已实施的边界

`src-tauri/capabilities/default.json` 不再声明 `path: "**"`，`tauri.conf.json` 的 asset protocol 初始 scope 也为空。应用启动时没有可读取的任意磁盘路径。

用户通过原生“打开 Markdown”或“另存为”选择器选中路径后，Rust 才将该 Markdown 所在目录（含其子目录）加入 Tauri 的运行时 FS scope 和 asset scope。文件关联启动也走相同授权。该目录范围是本产品的最小可行边界：Markdown 本体、同名批注 sidecar、原子保存的临时文件、当前目录相邻 Markdown，以及文档引用的本地图片都需要它。

原生 `read_markdown_text`、相邻 Markdown 枚举和资源盘点还会检查内存中的已授权目录，并只接受 Markdown 或受支持的 `.mdreader.json` sidecar；它们不会因为渲染器传入一个任意绝对路径而读取文件。

## 验证证据

- `cargo test --manifest-path src-tauri/Cargo.toml`：7 项通过，其中覆盖授权目录下 Markdown/sidecar 放行、普通 `secret.txt` 拒绝，以及资源路径逃逸拒绝。
- `npm run build`：通过。

## 发布前手工验证

在安装后的 Windows 应用中，分别从用户目录、其他盘符和网络位置选择一个 Markdown，并确认：打开、保存/另存为、外部修改监听、同目录相对图片、批注 sidecar 和相邻文档导航均正常；再确认未打开文档时不能通过开发者工具读取任意路径。网络共享、符号链接和撤销授权后的进程生命周期目前没有单独的自动化安装包测试，不能宣称已完成该层验证。
