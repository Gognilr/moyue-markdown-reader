# 批注 sidecar 格式

批注不会改写原 Markdown。可移植数据使用与文档相邻的 `文档名.mdreader.json`，并采用 UTF-8 JSON。

当前文件格式为版本 2：顶层包含固定 `schema`（`md-reader.annotation-sidecar`）、`version`、`documentKey`、`annotations`、`excerpts` 与 `updatedAt`。读取时会逐项校验锚点、批注类别和时间戳，拒绝格式不正确、版本不支持或与当前文档不匹配的数据。

旧版 localStorage 记录是没有 `schema` 的 `DocumentAnnotations` v1 JSON；读取时会在内存中迁移为当前格式，导出时总是写出 v2。`localStorageAnnotationsToSidecar` 与 `sidecarToLocalStorageAnnotations` 提供两种存储形态之间的纯转换，原生文件读写由调用方负责。
