# Third-party notices

Markdown 阅读器使用第三方开源软件。本文件是便于审阅的直接依赖摘要，不替代各依赖包中随附的完整许可证和版权声明；准确版本以 `package-lock.json` 与 `src-tauri/Cargo.lock` 为准。

## JavaScript 直接依赖

| 组件 | 当前解析版本 | 许可证 |
| --- | ---: | --- |
| React / React DOM | 18.3.1 | MIT |
| Tauri JavaScript API / plugins | 2.x | MIT OR Apache-2.0 |
| react-markdown / remark / rehype | 9.x / 4–7.x | MIT |
| Mermaid | 11.0.0 | MIT |
| KaTeX | 0.16.0 | MIT |
| docx | 9.5.1 | MIT |
| pdf-lib / @pdf-lib/fontkit | 1.17.1 / 1.1.1 | MIT |
| fflate | 0.8.2 | MIT |
| Zustand | 4.5.7 | MIT |
| Lucide React | 0.300.0 | ISC |
| github-slugger | 2.0.0 | ISC |
| Vite / Vitest | 5.4.21 / 2.1.9 | MIT |
| Playwright Test | 1.55.0 | Apache-2.0 |
| TypeScript | 5.9.3 | Apache-2.0 |

## Rust 直接依赖

主要包括 Tauri 2 及官方插件、Serde、encoding_rs、base64、windows/windows-sys 和 winreg。请以 Cargo registry 中对应版本的 `Cargo.toml` 与许可证文件为准。

## 图标和测试素材

仓库中的应用图标及 `test-artifacts/` 黄金样本由项目维护者创建或为本项目测试生成，按项目 MIT License 发布。贡献者不得提交无权再分发的商标、字体、图片或文档。
