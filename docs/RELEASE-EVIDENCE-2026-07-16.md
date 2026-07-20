# Release evidence — 2026-07-16

## Completed local gates

- `npm test`: 57 files, 166 tests passed.
- `npm run build`: passed. Vite retains existing dynamic-import and chunk-size warnings.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 10 tests passed.
- `cargo check --release --manifest-path src-tauri/Cargo.toml`: passed.

## Produced artifacts

- `src-tauri/target/release/md-reader.exe` — 14,612,480 bytes.
- `src-tauri/target/release/bundle/nsis/Markdown阅读器_1.0.0_x64-setup.exe` — 2,937,245 bytes.
- NSIS installer SHA-256: `FE3688F4B2ECFAA2A2BA54E7143637A52C7348382D918767847894FA2EBEFE4D`.

## Still required before release sign-off

- Clean-Windows install, upgrade and uninstall verification.
- Post-install double-click `.md` / `.markdown` association verification.
- Native long-document checks for file watching, semantic viewport anchoring and legacy GB18030 decoding.
