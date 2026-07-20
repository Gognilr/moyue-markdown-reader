# 墨阅品牌图标套件

主图形为打开的书页、墨迹笔势与书签，不含文字，适合小尺寸桌面图标。

- `moyue-logo-master.png`：透明底主视觉，1254 × 1254。
- `moyue-app-icon-master.png`：为 EXE、任务栏与桌面快捷方式裁切的高占比图标版本；主体约占画布 90%。
- `moyue-system-icon-master.png`：当前实际用于 EXE、任务栏、桌面快捷方式、安装器和卸载器的高对比实底图标；为 Windows 16/32 像素显示单独设计。
- `moyue-app-v2-master.png`：当前系统图标；进一步移除书页细节，采用满幅深色底、粗体 M 与朱红书签，专门解决 16–32px 模糊问题。
- `moyue-desktop.ico`：Windows 多尺寸桌面图标，含 16 至 256 像素图层。
- `icons/`：`moyue-*` 为主 Logo 尺寸，`moyue-app-*` 为高占比应用图标尺寸；均覆盖 16、20、24、32、40、44、48、64、72、96、128、150、256、310、512、1024 像素。
- `src-tauri/icons/moyue/icon-v2.ico`：Tauri/EXE 当前使用的“深色底 + 奶白 M + 红色书签”多尺寸图标；这是用户截图明确指定的正式系统图标。
- `src-tauri/icons/moyue/installer-v2.ico`：NSIS 安装器与卸载器使用的同版图标。
- `src-tauri/icons/moyue/shortcut-v2.ico`：安装后由桌面快捷方式独立引用的同版图标。
- `scripts/generate-brand-icon.py` 与 `icon-brand-crisp.ico`：保留为一次未采用的小尺寸书页适配实验，不进入当前安装包。
- `src-tauri/icons/moyue/shortcut-v2.ico`：安装时复制为独立文件，快捷方式引用带版本的新路径以绕开旧缓存键。

生成来源为本地 AI 图像生成，后经色键去背、应用图标安全区裁切与无损多尺寸缩放。`moyue-logo-master-chroma.png` 仅保留作去背前的可追溯源文件，不应作为发布资产。
