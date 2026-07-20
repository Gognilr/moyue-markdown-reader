# 轻量文档标签与撤销模型

`src/store/useDocumentTabsStore.ts` 是独立于主阅读页的文档会话模型。它刻意只提供轻量标签，不引入工作区、分屏或后台文件同步。

- 同一路径只会打开一个标签；无路径的新文档必须提供会话内唯一 `id`。
- 每个标签独立保存 `undoStack` 和 `redoStack`，上限为 100 个内容快照。
- `isDirty` 始终由当前 `content` 与最近一次 `savedContent` 的比较得出；`markSaved` 才会更新保存基线。
- `requestClose` 对干净标签返回 `close`，对脏标签返回 `confirm-discard`。宿主必须在自定义未保存对话框得到明确丢弃决定后才调用 `discardAndClose`。
- `reloadDocument` 是外部重新载入的显式边界：它清空本标签撤销栈并设定新的保存基线，不能静默用于覆盖草稿。

`DocumentTabs` 是无状态展示组件。主界面后续接入时，应把 `onRequestClose` 连接到现有的未保存变更对话框，而不能直接调用 `closeTab`。
