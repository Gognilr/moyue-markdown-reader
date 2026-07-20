# Markdown Reader

A local-first Markdown reader and lightweight notepad for Windows. It opens documents in a clean reading view while retaining reliable editing, native file-session handling, printing, and document export.

[简体中文](README.md) · [Build guide](docs/BUILDING.md) · [Privacy](docs/PRIVACY.md) · [Contributing](CONTRIBUTING.md)

## Highlights

- Local-first reading and editing with no account or cloud service required.
- Native open, drag-and-drop, file association, history, tabs, atomic save, unsaved-change protection, and external-change conflict handling.
- GFM tables, task lists, math, Mermaid, syntax highlighting, local images, footnotes, and additional Markdown extensions.
- Segmented rendering and windowed navigation for large documents.
- Windows file associations, recent/favorite Jump Lists, and an opt-in Explorer context-menu quick preview.
- Isolated document printing plus DOCX, PDF, and current-table XLSX export.

## Platform support

Windows 10/11 x64 is the currently supported and tested platform. The application is built with Tauri 2, React 18, TypeScript, and Rust. Native behavior and visual output have not been accepted on other platforms.

## Run from source

Install Node.js 20+, npm 10+, Rust stable with the MSVC toolchain, Microsoft C++ Build Tools, the Windows SDK, and WebView2 Runtime.

```powershell
npm ci
npm run tauri dev
```

See [docs/BUILDING.md](docs/BUILDING.md) for production and verification commands.

## Privacy and security

Markdown content is processed locally by default. Files are read only after a native picker, file association, or an explicit application action grants access. See [docs/PRIVACY.md](docs/PRIVACY.md), [docs/security-scope.md](docs/security-scope.md), and [SECURITY.md](SECURITY.md).

## Contributing

Bug reports, documentation improvements, and narrowly scoped pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) first.

## License

Licensed under the [MIT License](LICENSE). Third-party components remain under their respective licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
