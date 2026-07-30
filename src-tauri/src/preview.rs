//! Native lifecycle primitives for the lightweight Markdown preview window.
//!
//! The web UI owns keyboard handling and document rendering.  This module only
//! owns the native-window contract: a single reusable frameless preview window,
//! the selected Markdown path, and the transition from preview to a normal
//! top-level window.  Keeping that boundary here prevents a quick-preview
//! invocation from mutating the main reading window.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const PREVIEW_WINDOW_LABEL: &str = "markdown-quick-preview";
pub const PREVIEW_OPEN_EVENT: &str = "markdown-preview:open-file";
pub const LIVE_MIRROR_OPEN_EVENT: &str = "markdown-preview:open-live-mirror";
const MAX_LIVE_MIRROR_MARKDOWN_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiveMirrorOverlaySnapshot {
    pub id: String,
    pub kind: String,
    pub line: usize,
    pub label: String,
}

/// A deliberately self-contained read-only snapshot.  The temporary webview
/// never reaches into the primary reader's Zustand stores or writes a file.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiveMirrorSnapshot {
    pub title: String,
    pub markdown: String,
    pub overlays: Vec<LiveMirrorOverlaySnapshot>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum PreviewSessionKind {
    Quick,
    LiveMirror,
}

#[derive(Default)]
pub struct PreviewState {
    current_path: Mutex<Option<PathBuf>>,
    live_mirror: Mutex<Option<LiveMirrorSnapshot>>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct PreviewOpenResult {
    pub path: String,
    pub reused_window: bool,
}

fn prepare_transient_window(window: &WebviewWindow, title: &str) -> Result<(), String> {
    window.set_title(title).map_err(|error| error.to_string())?;
    window.set_decorations(false).map_err(|error| error.to_string())?;
    window.set_always_on_top(true).map_err(|error| error.to_string())?;
    window.set_skip_taskbar(true).map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.unminimize().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

fn validate_live_mirror_snapshot(snapshot: &LiveMirrorSnapshot) -> Result<(), String> {
    if snapshot.title.trim().is_empty() {
        return Err("Live Mirror requires a document title.".to_string());
    }
    if snapshot.markdown.len() > MAX_LIVE_MIRROR_MARKDOWN_BYTES {
        return Err("Live Mirror snapshot exceeds the 4 MiB temporary-window limit.".to_string());
    }
    if snapshot.overlays.len() > 10_000 {
        return Err("Live Mirror snapshot contains too many overlays.".to_string());
    }
    Ok(())
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

/// Resolve a candidate before creating a preview window.  The command only
/// accepts an existing Markdown file; directories and arbitrary files are
/// deliberately rejected instead of making the preview an implicit file browser.
pub fn canonical_preview_path(path: &str) -> Result<PathBuf, String> {
    let candidate = Path::new(path);
    if !is_markdown(candidate) {
        return Err("Quick preview only accepts .md or .markdown files.".to_string());
    }

    let canonical = candidate
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !canonical.is_file() {
        return Err("Quick preview requires a Markdown file, not a directory.".to_string());
    }
    Ok(canonical)
}

fn require_preview_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == PREVIEW_WINDOW_LABEL {
        Ok(())
    } else {
        Err("This command is only available from the quick preview window.".to_string())
    }
}

/// Resolve the neighbouring Markdown file in the current document's directory.
/// Ordering is deterministic and intentionally non-recursive: preview keyboard
/// navigation must not accidentally turn into a project-wide file browser.
fn adjacent_markdown_path(current: &Path, direction: i32) -> Result<Option<PathBuf>, String> {
    let Some(parent) = current.parent() else {
        return Ok(None);
    };
    let mut files = std::fs::read_dir(parent)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_markdown(path))
        .collect::<Vec<_>>();
    files.sort_by_key(|path| path.file_name().map(|name| name.to_string_lossy().to_lowercase()));

    let Some(index) = files.iter().position(|path| path == current) else {
        return Ok(None);
    };
    let target = if direction < 0 {
        index.checked_sub(1)
    } else {
        index.checked_add(1).filter(|next| *next < files.len())
    };
    Ok(target.map(|next| files[next].clone()))
}

/// Open (or reuse) the one transient preview window.  This is asynchronous on
/// purpose: Tauri documents a Windows WebView2 deadlock risk for synchronously
/// creating a webview from an invoke handler.
#[tauri::command]
pub async fn open_markdown_preview(
    app: AppHandle,
    state: State<'_, PreviewState>,
    roots: State<'_, crate::commands::AuthorizedDocumentRoots>,
    path: String,
) -> Result<PreviewOpenResult, String> {
    open_preview_window(&app, &state, &roots, &path)
}

/// Shared core of `open_markdown_preview`, callable without command plumbing.
/// The single-instance callback uses it to route `--quick-preview` launches of
/// a second process into the already-running instance's preview window.
pub fn open_preview_window(
    app: &AppHandle,
    state: &PreviewState,
    roots: &crate::commands::AuthorizedDocumentRoots,
    path: &str,
) -> Result<PreviewOpenResult, String> {
    let canonical = canonical_preview_path(path)?;
    let canonical = crate::commands::grant_document_directory(app, roots, &canonical)?;
    let display_path = canonical.to_string_lossy().into_owned();
    {
        let mut current = state
            .current_path
            .lock()
            .map_err(|_| "Quick preview state is unavailable.".to_string())?;
        *current = Some(canonical);
    }
    {
        let mut live_mirror = state
            .live_mirror
            .lock()
            .map_err(|_| "Quick preview state is unavailable.".to_string())?;
        *live_mirror = None;
    }

    let existing = app.get_webview_window(PREVIEW_WINDOW_LABEL);
    let reused_window = existing.is_some();
    let preview = match existing {
        Some(window) => {
            prepare_transient_window(&window, "Markdown quick preview")?;
            window
        }
        None => WebviewWindowBuilder::new(
            app,
            PREVIEW_WINDOW_LABEL,
            WebviewUrl::App("index.html".into()),
        )
        .title("Markdown quick preview")
        .inner_size(920.0, 660.0)
        .min_inner_size(480.0, 320.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true)
        .build()
        .map_err(|error| error.to_string())?,
    };

    // The event is intentionally emitted after the state is written.  A late
    // listener can still retrieve the path via `preview_markdown_path`.
    preview
        .emit(PREVIEW_OPEN_EVENT, display_path.clone())
        .map_err(|error| error.to_string())?;

    Ok(PreviewOpenResult {
        path: display_path,
        reused_window,
    })
}

/// Open the same lightweight native surface with a read-only in-memory mirror
/// snapshot.  This is intentionally separate from `open_markdown_preview`:
/// a mirror can show unsaved content and diagnostic overlays, while quick
/// preview remains a path-backed file browser entry point.
#[tauri::command]
pub async fn open_live_mirror_preview(
    app: AppHandle,
    state: State<'_, PreviewState>,
    snapshot: LiveMirrorSnapshot,
) -> Result<PreviewOpenResult, String> {
    validate_live_mirror_snapshot(&snapshot)?;
    let display_title = snapshot.title.clone();
    {
        let mut current = state
            .current_path
            .lock()
            .map_err(|_| "Live Mirror state is unavailable.".to_string())?;
        *current = None;
    }
    {
        let mut live_mirror = state
            .live_mirror
            .lock()
            .map_err(|_| "Live Mirror state is unavailable.".to_string())?;
        *live_mirror = Some(snapshot);
    }

    let existing = app.get_webview_window(PREVIEW_WINDOW_LABEL);
    let reused_window = existing.is_some();
    let preview = match existing {
        Some(window) => {
            prepare_transient_window(&window, &format!("Live Mirror — {display_title}"))?;
            window
        }
        None => WebviewWindowBuilder::new(
            &app,
            PREVIEW_WINDOW_LABEL,
            WebviewUrl::App("index.html".into()),
        )
        .title(format!("Live Mirror — {display_title}"))
        .inner_size(920.0, 660.0)
        .min_inner_size(480.0, 320.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(true)
        .build()
        .map_err(|error| error.to_string())?,
    };

    preview
        .emit(LIVE_MIRROR_OPEN_EVENT, ())
        .map_err(|error| error.to_string())?;
    Ok(PreviewOpenResult { path: display_title, reused_window })
}

/// The snapshot can only be read from the transient preview webview.  The
/// primary window cannot accidentally observe or alter an in-memory mirror.
#[tauri::command]
pub fn live_mirror_preview_snapshot(
    window: WebviewWindow,
    state: State<'_, PreviewState>,
) -> Result<Option<LiveMirrorSnapshot>, String> {
    require_preview_window(&window)?;
    state
        .live_mirror
        .lock()
        .map_err(|_| "Live Mirror state is unavailable.".to_string())
        .map(|snapshot| snapshot.clone())
}

#[tauri::command]
pub fn preview_session_kind(
    window: WebviewWindow,
    state: State<'_, PreviewState>,
) -> Result<Option<PreviewSessionKind>, String> {
    require_preview_window(&window)?;
    let is_mirror = state
        .live_mirror
        .lock()
        .map_err(|_| "Preview state is unavailable.".to_string())?
        .is_some();
    Ok(Some(if is_mirror { PreviewSessionKind::LiveMirror } else { PreviewSessionKind::Quick }))
}

/// Returns the preview document only to the dedicated preview window.  The
/// primary app window cannot accidentally consume this transient session state.
#[tauri::command]
pub fn preview_markdown_path(
    window: WebviewWindow,
    state: State<'_, PreviewState>,
) -> Result<Option<String>, String> {
    require_preview_window(&window)?;
    let path = state
        .current_path
        .lock()
        .map_err(|_| "Quick preview state is unavailable.".to_string())?
        .as_ref()
        .map(|path| path.to_string_lossy().into_owned());
    Ok(path)
}

/// Esc is handled by the preview frontend and calls this command.  Closing the
/// preview must never close or hide the main reading window.
#[tauri::command]
pub fn close_markdown_preview(window: WebviewWindow) -> Result<(), String> {
    require_preview_window(&window)?;
    window.close().map_err(|error| error.to_string())
}

/// Enter is handled by the preview frontend and calls this command.  It turns
/// the temporary frameless, always-on-top surface into a normal app window
/// without reopening or changing the main reader.
#[tauri::command]
pub fn promote_markdown_preview(window: WebviewWindow) -> Result<(), String> {
    require_preview_window(&window)?;
    window
        .set_decorations(true)
        .map_err(|error| error.to_string())?;
    window
        .set_always_on_top(false)
        .map_err(|error| error.to_string())?;
    window
        .set_skip_taskbar(false)
        .map_err(|error| error.to_string())?;
    window
        .set_title("Markdown Reader")
        .map_err(|error| error.to_string())?;
    Ok(())
}

/// Switch the transient preview to the previous or next Markdown sibling.
/// The operation is exposed only to the preview window and deliberately stops
/// at directory boundaries instead of wrapping around unexpectedly.
#[tauri::command]
pub fn navigate_markdown_preview(
    window: WebviewWindow,
    state: State<'_, PreviewState>,
    direction: i32,
) -> Result<Option<String>, String> {
    require_preview_window(&window)?;
    if direction != -1 && direction != 1 {
        return Err("Preview direction must be -1 or 1.".to_string());
    }
    let next = {
        let current = state
            .current_path
            .lock()
            .map_err(|_| "Quick preview state is unavailable.".to_string())?;
        current
            .as_deref()
            .map(|path| adjacent_markdown_path(path, direction))
            .transpose()?
            .flatten()
    };
    let Some(next) = next else {
        return Ok(None);
    };
    let display_path = next.to_string_lossy().into_owned();
    {
        let mut current = state
            .current_path
            .lock()
            .map_err(|_| "Quick preview state is unavailable.".to_string())?;
        *current = Some(next);
    }
    window
        .emit(PREVIEW_OPEN_EVENT, display_path.clone())
        .map_err(|error| error.to_string())?;
    Ok(Some(display_path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn markdown_extensions_are_required_before_file_access() {
        let error = canonical_preview_path("C:/docs/readme.txt").unwrap_err();
        assert!(error.contains(".md"));
    }

    #[test]
    fn canonical_preview_path_accepts_existing_markdown_file() {
        let path = std::env::temp_dir().join(format!(
            "md-reader-preview-test-{}-{}.MD",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::write(&path, "# Preview").unwrap();

        let resolved = canonical_preview_path(&path.to_string_lossy()).unwrap();
        assert!(resolved.is_file());
        assert!(is_markdown(&resolved));

        fs::remove_file(path).unwrap();
    }

    #[test]
    fn sibling_navigation_is_sorted_and_stops_at_edges() {
        let directory = std::env::temp_dir().join(format!(
            "md-reader-preview-siblings-{}-{}",
            std::process::id(),
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir_all(&directory).unwrap();
        let first = directory.join("a.md");
        let middle = directory.join("B.markdown");
        let last = directory.join("c.md");
        fs::write(&first, "a").unwrap();
        fs::write(&middle, "b").unwrap();
        fs::write(&last, "c").unwrap();
        fs::write(directory.join("ignored.txt"), "x").unwrap();

        assert_eq!(adjacent_markdown_path(&middle, -1).unwrap().as_deref(), Some(first.as_path()));
        assert_eq!(adjacent_markdown_path(&middle, 1).unwrap().as_deref(), Some(last.as_path()));
        assert!(adjacent_markdown_path(&first, -1).unwrap().is_none());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn live_mirror_snapshot_rejects_unbounded_payloads() {
        let snapshot = LiveMirrorSnapshot {
            title: "A".into(),
            markdown: "x".repeat(MAX_LIVE_MIRROR_MARKDOWN_BYTES + 1),
            overlays: vec![],
        };
        assert!(validate_live_mirror_snapshot(&snapshot).unwrap_err().contains("4 MiB"));
    }
}
