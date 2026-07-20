# 文档健康检查

`checkDocumentHealth(markdown, options)` 是一个纯检查器。它只解析传入的 Markdown，绝不自行读取本地文件、解码字节、检查字体，或访问网络。

## 可注入的事实

- `resourceInventory`：由打开层或打包层提供、以 Markdown 中原始相对 URL 为键的资源元数据。仅在 `exists: false` 时报告已验证的缺失；没有条目仍是“待解析”。图片只有在已提供 `exists: true` 的尺寸或字节数时才会被判为过大。
- `encoding`：只有文件打开层明确传入 `suspicious: true` 才提示异常编码。检查器不会根据文本猜测编码。
- `export.font`：只有调用方提供字体的已知字形集合时，才检查缺字；未提供时不对导出字体作任何结论。
- `export.checkUnsupportedSyntax`：当前导出 IR 不保留原始 HTML 与链接引用定义；启用该选项会在源位置提示需要复核。

这使主进程、浏览器预览和测试都可以复用同一套规则，同时不会把“尚未读取”的资源错误显示成“文件丢失”。

## 阈值

图片超过 10 MiB 或 1600 万像素时提示为过大。这是导出与随身包的体积提醒，不会阻止阅读或导出。
