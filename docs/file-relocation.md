# 文件移动找回

`src/features/relocation/fileRelocation.ts` 提供不依赖 Tauri 或浏览器文件 API 的匹配核心。

主界面接入应在一次文件失效后执行：

1. 使用原路径的父目录进行**非递归** Markdown 扫描；不要遍历磁盘。
2. 对有限候选读取内容，调用 `createContentFingerprint`；把原文件最近一次成功读取时保存的指纹作为 `LostFileIdentity.fingerprint`。
3. 用 `rankRelocationCandidates` 展示候选、理由和置信度。只有 `recommendRelocation` 返回结果时，才可以提示用户确认重新绑定；绝不静默切换路径。
4. 用户确认后更新历史记录、文件监听和恢复胶囊的 `documentKey`；取消则保留失效历史项。

内容指纹是稳定的非加密 FNV-1a 标识，仅用于本地候选排序，不能作为安全校验或跨设备唯一 ID。文件名匹配只会得到“中等”置信度，重名文件不会自动恢复。
