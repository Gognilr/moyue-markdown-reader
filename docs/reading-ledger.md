# 阅读理解状态账本

`src/features/reading-ledger` 是一个本地、单文档的纯状态核心。它让读者明确记录某个认知航线/原文块为：**懂了、存疑、跳过、不同意**。每条记录保留稳定块锚点、可选阅读目的、可选备注和时间；它不会改写 Markdown。

## 边界

- 只有显式调用 `recordReadingState` 才会写入状态；滚动、停留、搜索或 AI 都不会把内容自动标为“懂了”。
- `suggestLowConfidenceNudge` 仅从调用方提供的低置信本地行为信号生成可关闭提示，且不会写入理解状态。高置信信号不会被升级为自动判断。
- `assessReadingLedgerImpact` 只比较同一文档当前可见的块锚点。它会提示“原文改变或缺失，需要复核”，不会声称跨文档影响、推断真伪，也不调用 AI 或网络。
- 这不是跨版本/跨文档知识图谱；调用方需要自行在合适的阅读界面中选择何时加载、显示或保存。

## 持久化与迁移

`createLocalStorageReadingLedgerRepository(storage)` 使用 `md-reader:reading-ledger:<documentKey>` 保存版本化 JSON。当前规范为 `md-reader.reading-ledger` v2；`parseReadingLedger` 可迁移早期 v1 的本地 `states` 数组。无效或不属于当前文档的数据会抛错，避免静默混入错误文档。

该模块未接入主阅读界面，也未声明 sidecar、同步或 AI 功能；这些入口和交互需另行实现并验证。
