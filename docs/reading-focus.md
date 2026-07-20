# 阅读专注套件：可选基础设施

`src/features/reading-focus/tts.ts` 使用浏览器内置 Web Speech API。它在用户显式调用 `speak` 后才把本地生成的纯文本交给操作系统语音能力；不请求网络、不上传 Markdown，也不会在不支持 Web Speech 的浏览器中抛错。调用方可选择跳过代码、链接、表格，或只生成表格行列与表头描述。

`src/features/reading-focus/focusTimer.ts` 是没有账户、打卡、通知或统计上传的本地状态机。运行中的计时器重新打开后会恢复为暂停，避免后台持续计时。`FocusTimer` 是可嵌入组件，当前刻意未接入主阅读视图，等待产品确定入口位置。

现有阅读标尺、段落步进和自动滚动仍由 `ReadingFocus` 提供。
