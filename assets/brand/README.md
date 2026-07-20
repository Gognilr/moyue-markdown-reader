# 墨阅品牌图标套件

主图形为打开的书页、墨迹笔势与书签，不含文字，适合小尺寸桌面图标。

- `moyue-logo-master.png`：透明底主视觉，1254 × 1254。
- `moyue-app-icon-master.png`：为 EXE、任务栏与桌面快捷方式裁切的高占比图标版本；主体约占画布 90%。
- `moyue-system-icon-master.png`：当前实际用于 EXE、任务栏、桌面快捷方式、安装器和卸载器的高对比实底图标；为 Windows 16/32 像素显示单独设计。
- `moyue-app-v2-master.png`：当前系统图标；进一步移除书页细节，采用满幅深色底、粗体 M 与朱红书签，专门解决 16–32px 模糊问题。
- `moyue-desktop.ico`：Windows 多尺寸桌面图标，含 16 至 256 像素图层。
- `icons/`：`moyue-*` 为主 Logo 尺寸，`moyue-app-*` 为高占比应用图标尺寸；均覆盖 16、20、24、32、40、44、48、64、72、96、128、150、256、310、512、1024 像素。
- `src-tauri/icons/moyue/icon-brand-crisp.ico`：Tauri、EXE、NSIS 安装器与卸载器当前统一使用的原定“书页 + 墨迹 M + 红色书签”品牌图标。16–48px 使用像素对齐的忠实简化帧，64–256px 保留原始精细图。
- `scripts/generate-brand-icon.py`：从原始品牌图生成上述 Windows 多尺寸 ICO，避免把阴影和墨迹纹理直接压缩成任务栏灰色噪点。
- 安装器会把同一品牌图标以 `moyue-brand-crisp.ico` 独立安装，供桌面快捷方式引用并绕开旧图标缓存。
- `src-tauri/icons/moyue/shortcut-v2.ico`：安装时复制为独立文件，快捷方式引用带版本的新路径以绕开旧缓存键。

生成来源为本地 AI 图像生成，后经色键去背、应用图标安全区裁切与无损多尺寸缩放。`moyue-logo-master-chroma.png` 仅保留作去背前的可追溯源文件，不应作为发布资产。
