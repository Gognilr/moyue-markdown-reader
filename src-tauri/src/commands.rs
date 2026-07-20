use std::sync::{Arc, Mutex};

#[tauri::command]
pub fn export_pdf_placeholder() -> Result<String, String> {
    // 预留 PDF 导出接口
    Ok("PDF export feature is reserved under Phase 2.".to_string())
}

#[tauri::command]
pub fn register_file_association_placeholder() -> Result<String, String> {
    // 预留 Windows 右键菜单绑定注册接口
    Ok("File association registration is reserved under Phase 2.".to_string())
}

/// 返回操作系统通过文件关联传入的首个 Markdown 路径。
/// 前端主动读取，避免启动期间事件早于 WebView 监听器而丢失。
#[tauri::command]
pub fn startup_markdown_path(app: AppHandle, roots: tauri::State<AuthorizedDocumentRoots>) -> Option<String> {
    if startup_quick_preview_argument().is_some() { return None; }
    std::env::args().skip(1).find(|argument| {
        let lower = argument.to_ascii_lowercase();
        (lower.ends_with(".md") || lower.ends_with(".markdown"))
            && std::path::Path::new(argument).is_file()
    }).and_then(|path| grant_document_directory(&app, &roots, Path::new(&path)).ok().map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn startup_quick_preview_path(app: AppHandle, roots: tauri::State<AuthorizedDocumentRoots>) -> Option<String> {
    startup_quick_preview_argument()
        .filter(|path| Path::new(path).is_file() && is_markdown(Path::new(path)))
        .and_then(|path| grant_document_directory(&app, &roots, Path::new(&path)).ok().map(|path| path.to_string_lossy().into_owned()))
}

fn startup_quick_preview_argument() -> Option<String> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    arguments.windows(2).find_map(|pair| (pair[0] == "--quick-preview").then(|| pair[1].clone()))
}

#[derive(Default, Clone)]
pub struct AuthorizedDocumentRoots(Arc<Mutex<Vec<PathBuf>>>);

/// Export targets are authorized one-at-a-time by the native save dialog.
/// Unlike document roots, an export grant is for one exact output file only.
#[derive(Default, Clone)]
pub struct AuthorizedExportTargets(Arc<Mutex<Vec<PathBuf>>>);

/// Runtime filesystem and asset scopes begin empty.  A directory is expanded
/// only after the operating-system picker (or a file-association launch) has
/// supplied a Markdown document.  The granted directory is needed for its
/// sidecar, atomic-save temporary file, adjacent Markdown navigation and
/// authored local images; no global path is ever configured.
pub fn grant_document_directory(app: &AppHandle, roots: &AuthorizedDocumentRoots, document: &Path) -> Result<PathBuf, String> {
    let document = document.canonicalize().map_err(|error| error.to_string())?;
    if !document.is_file() || !is_markdown(&document) {
        return Err("Only existing .md or .markdown documents may be authorized.".to_string());
    }
    let directory = document.parent().ok_or_else(|| "Document has no parent directory.".to_string())?;
    app.fs_scope().allow_directory(directory, true).map_err(|error| error.to_string())?;
    app.asset_protocol_scope().allow_directory(directory, true).map_err(|error| error.to_string())?;
    let mut authorized = roots.0.lock().map_err(|_| "Document access state is unavailable.".to_string())?;
    if !authorized.iter().any(|root| root == directory) {
        authorized.push(directory.to_path_buf());
    }
    // Runtime plugin scopes are intentionally empty on every process start.
    // Remember the exact document selected by the user so a later click in
    // Recent files can restore that document's directory grant without asking
    // them to select the same file again.
    if let Err(error) = remember_document_grant(app, &document) {
        eprintln!("Unable to persist Markdown document grant: {error}");
    }
    Ok(document)
}

const DOCUMENT_GRANTS_FILE: &str = "document-grants.json";

fn document_grants_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir()
        .map(|directory| directory.join(DOCUMENT_GRANTS_FILE))
        .map_err(|error| error.to_string())
}

fn read_document_grants(app: &AppHandle) -> Vec<PathBuf> {
    let mut grants = document_grants_path(app).ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|value| serde_json::from_str::<Vec<String>>(&value).ok())
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<_>>();

    // One-time compatibility bridge for documents opened by releases that
    // predate document-grants.json. settings.json is application-owned Store
    // data and contains only paths the reader previously added to History.
    if let Ok(directory) = app.path().app_data_dir() {
        if let Ok(value) = fs::read_to_string(directory.join("settings.json")) {
            grants.extend(history_paths_from_settings(&value).into_iter().map(PathBuf::from));
        }
    }
    grants
}

fn history_paths_from_settings(value: &str) -> Vec<String> {
    serde_json::from_str::<serde_json::Value>(value).ok()
        .and_then(|settings| settings.get("history").and_then(|history| history.as_array()).cloned())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.get("path").and_then(|path| path.as_str()).map(str::to_owned))
        .filter(|value| is_valid_persisted_markdown_path(value, Path::new(value)))
        .collect()
}

fn remember_document_grant(app: &AppHandle, document: &Path) -> Result<(), String> {
    let canonical = document.canonicalize().map_err(|error| error.to_string())?;
    let mut grants = read_document_grants(app).into_iter()
        .filter_map(|path| path.canonicalize().ok())
        .collect::<Vec<_>>();
    if !grants.iter().any(|path| path == &canonical) {
        grants.push(canonical);
    }
    grants.sort();
    grants.dedup();
    let target = document_grants_path(app)?;
    if let Some(directory) = target.parent() {
        fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    }
    let serialized = serde_json::to_string_pretty(&grants.iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect::<Vec<_>>()).map_err(|error| error.to_string())?;
    fs::write(target, serialized).map_err(|error| error.to_string())
}

fn is_remembered_document(app: &AppHandle, document: &Path) -> bool {
    let Ok(canonical) = document.canonicalize() else { return false; };
    read_document_grants(app).into_iter().any(|path| {
        path.canonicalize().is_ok_and(|known| known == canonical)
    })
}

fn is_authorized_document_or_sidecar(roots: &AuthorizedDocumentRoots, path: &Path) -> bool {
    let Ok(path) = path.canonicalize() else { return false; };
    let allowed_name = is_markdown(&path) || is_approved_sidecar_name(&path);
    allowed_name && roots.0.lock().is_ok_and(|roots| roots.iter().any(|root| path.starts_with(root)))
}

#[tauri::command]
pub async fn pick_markdown_document(app: AppHandle, roots: tauri::State<'_, AuthorizedDocumentRoots>) -> Result<Option<String>, String> {
    let roots = roots.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file().add_filter("Markdown", &["md", "markdown"]).blocking_pick_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| error.to_string())?;
        grant_document_directory(&app, &roots, &path).map(|path| Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|error| error.to_string())?
}

/// A package is read as bytes by this native boundary immediately after the
/// operating-system picker returns it.  Unlike Markdown documents, it never
/// receives a filesystem/asset-scope grant: package contents are validated and
/// kept in the renderer's memory only.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedOpenPackage {
    name: String,
    bytes: Vec<u8>,
}

#[tauri::command]
pub async fn pick_open_package(app: AppHandle) -> Result<Option<PickedOpenPackage>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let selected = app.dialog().file()
            .add_filter("Markdown Reader open package", &["zip"])
            .blocking_pick_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| error.to_string())?;
        let lower = path.file_name().and_then(|name| name.to_str()).unwrap_or_default().to_ascii_lowercase();
        if !lower.ends_with(".mdpack.zip") {
            return Err("Only .mdpack.zip packages created for Markdown Reader can be opened.".to_string());
        }
        let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
        if metadata.len() == 0 || metadata.len() > 64 * 1024 * 1024 {
            return Err("Package size is outside the supported 0-64 MiB range.".to_string());
        }
        let name = path.file_name().and_then(|name| name.to_str())
            .ok_or_else(|| "Package name is not valid UTF-8.".to_string())?.to_string();
        let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
        Ok(Some(PickedOpenPackage { name, bytes }))
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn pick_markdown_save_path(app: AppHandle, roots: tauri::State<'_, AuthorizedDocumentRoots>, default_name: Option<String>) -> Result<Option<String>, String> {
    let roots = roots.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let name = default_name.unwrap_or_else(|| "untitled.md".to_string());
        let selected = app.dialog().file().set_file_name(&name).add_filter("Markdown", &["md", "markdown"]).blocking_save_file();
        let Some(selected) = selected else { return Ok(None); };
        let path = selected.into_path().map_err(|error| error.to_string())?;
        if !is_markdown(&path) { return Err("Save target must use .md or .markdown.".to_string()); }
        let parent = path.parent().ok_or_else(|| "Save target has no parent directory.".to_string())?.canonicalize().map_err(|error| error.to_string())?;
        app.fs_scope().allow_directory(&parent, true).map_err(|error| error.to_string())?;
        app.asset_protocol_scope().allow_directory(&parent, true).map_err(|error| error.to_string())?;
        let mut authorized = roots.0.lock().map_err(|_| "Document access state is unavailable.".to_string())?;
        if !authorized.iter().any(|root| root == &parent) { authorized.push(parent); }
        Ok(Some(path.to_string_lossy().into_owned()))
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn pick_export_save_path(app: AppHandle, targets: tauri::State<'_, AuthorizedExportTargets>, default_name: Option<String>, format: String) -> Result<Option<String>, String> {
    let targets = targets.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let format = format.to_ascii_lowercase();
        let (label, extension) = match format.as_str() {
            "docx" => ("Word document", "docx"),
            "pdf" => ("PDF document", "pdf"),
            "xlsx" => ("Excel workbook", "xlsx"),
            _ => return Err("Export format must be DOCX, PDF, or XLSX.".to_string()),
        };
        let name = default_name.unwrap_or_else(|| format!("document.{extension}"));
        let selected = app.dialog().file().set_file_name(&name).add_filter(label, &[extension]).blocking_save_file();
        let Some(selected) = selected else { return Ok(None); };
        let requested = selected.into_path().map_err(|error| error.to_string())?;
        if !has_extension(&requested, extension) { return Err(format!("Export target must use .{extension}.")); }
        let parent = requested.parent().ok_or_else(|| "Export target has no parent directory.".to_string())?.canonicalize().map_err(|error| error.to_string())?;
        let file_name = requested.file_name().ok_or_else(|| "Export target has no valid file name.".to_string())?;
        let target = parent.join(file_name);
        let mut authorized = targets.0.lock().map_err(|_| "Export access state is unavailable.".to_string())?;
        authorized.retain(|candidate| candidate != &target);
        authorized.push(target.clone());
        Ok(Some(target.to_string_lossy().into_owned()))
    }).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn write_export_binary(targets: tauri::State<AuthorizedExportTargets>, path: String, bytes: Vec<u8>) -> Result<(), String> {
    let requested = PathBuf::from(path);
    if !is_export_target(&requested) { return Err("Only DOCX, PDF, and XLSX export targets may be written.".to_string()); }
    let parent = requested.parent().ok_or_else(|| "Export target has no parent directory.".to_string())?.canonicalize().map_err(|error| error.to_string())?;
    let file_name = requested.file_name().ok_or_else(|| "Export target has no valid file name.".to_string())?;
    let target = parent.join(file_name);
    let mut authorized = targets.0.lock().map_err(|_| "Export access state is unavailable.".to_string())?;
    let Some(index) = authorized.iter().position(|candidate| candidate == &target) else {
        return Err("This export target was not authorized by the native save dialog.".to_string());
    };
    authorized.remove(index);
    drop(authorized);
    let temporary = parent.join(format!(".{}.{}.tmp", file_name.to_string_lossy(), std::process::id()));
    fs::write(&temporary, bytes).map_err(|error| error.to_string())?;
    if let Err(error) = replace_file_atomically(&temporary, &target) { let _ = fs::remove_file(&temporary); return Err(error); }
    Ok(())
}

/// Writes only an already-authorized Markdown target using a sibling temporary
/// file and one native rename. This avoids renderer plugin rename failures on
/// existing Windows files while preserving the dynamic directory boundary.
#[tauri::command]
pub fn write_markdown_text(roots: tauri::State<AuthorizedDocumentRoots>, path: String, content: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !is_authorized_writer_name(&target) { return Err("Only Markdown documents and this document's approved sidecar files may be written.".to_string()); }
    let parent = target.parent().ok_or_else(|| "Save target has no parent directory.".to_string())?.canonicalize().map_err(|error| error.to_string())?;
    let authorized = roots.0.lock().map_err(|_| "Document access state is unavailable.".to_string())?;
    if !authorized.iter().any(|root| parent.starts_with(root)) { return Err("This save target was not authorized by a native picker or file association.".to_string()); }
    drop(authorized);
    let file_name = target.file_name().and_then(|name| name.to_str()).ok_or_else(|| "Save target has no valid file name.".to_string())?;
    let temporary = parent.join(format!(".{file_name}.{}.tmp", std::process::id()));
    fs::write(&temporary, content).map_err(|error| error.to_string())?;
    if let Err(error) = replace_file_atomically(&temporary, &target) { let _ = fs::remove_file(&temporary); return Err(error); }
    Ok(())
}

fn is_authorized_writer_name(path: &Path) -> bool {
    is_markdown(path) || is_approved_sidecar_name(path)
}

fn has_extension(path: &Path, expected: &str) -> bool {
    path.extension().and_then(|extension| extension.to_str()).is_some_and(|extension| extension.eq_ignore_ascii_case(expected))
}

fn is_export_target(path: &Path) -> bool {
    has_extension(path, "docx") || has_extension(path, "pdf") || has_extension(path, "xlsx")
}

fn is_approved_sidecar_name(path: &Path) -> bool {
    path.file_name().and_then(|name| name.to_str()).is_some_and(|name|
        name.ends_with(".mdreader.json") || name.ends_with(".mdreader.tables.json"))
}

#[cfg(windows)]
fn replace_file_atomically(temporary: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH};

    let temporary = temporary.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();
    let target = target.as_os_str().encode_wide().chain(Some(0)).collect::<Vec<_>>();
    let moved = unsafe {
        MoveFileExW(
            temporary.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if moved == 0 { Err(std::io::Error::last_os_error().to_string()) } else { Ok(()) }
}

#[cfg(not(windows))]
fn replace_file_atomically(temporary: &Path, target: &Path) -> Result<(), String> {
    fs::rename(temporary, target).map_err(|error| error.to_string())
}

/// Read Markdown as UTF-8 where possible, with BOM removal and GB18030 fallback
/// for legacy Chinese documents. The command only reads an explicit user-selected
/// path; it does not enumerate or index the filesystem.
#[tauri::command]
pub fn read_markdown_text(roots: tauri::State<AuthorizedDocumentRoots>, path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if !is_authorized_document_or_sidecar(&roots, &path) {
        return Err("This path was not authorized by a native document picker or file association.".to_string());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    match std::str::from_utf8(bytes) {
        Ok(text) => Ok(text.to_owned()),
        Err(_) => {
            let (decoded, _, had_errors) = encoding_rs::GB18030.decode(bytes);
            if had_errors {
                return Err(
                    "The document is neither valid UTF-8 nor decodable as GB18030.".to_string(),
                );
            }
            Ok(decoded.into_owned())
        }
    }
}

/// Inspects a persisted history path without widening the runtime filesystem
/// scope.  "exists" intentionally means that the file is still at the recorded
/// location but must be selected once more through the operating-system picker.
#[tauri::command]
pub fn inspect_markdown_path_status(
    app: AppHandle,
    roots: tauri::State<AuthorizedDocumentRoots>,
    path: String,
) -> String {
    let status = markdown_path_status(&roots, &path);
    if status == "exists" && is_remembered_document(&app, Path::new(&path)) {
        return grant_document_directory(&app, &roots, Path::new(&path))
            .map(|_| "authorized".to_string())
            .unwrap_or_else(|_| "exists".to_string());
    }
    status.to_string()
}

fn markdown_path_status(roots: &AuthorizedDocumentRoots, value: &str) -> &'static str {
    let path = Path::new(value);
    if !is_valid_persisted_markdown_path(value, path) {
        return "invalid";
    }
    if !path.is_file() {
        return "missing";
    }
    if is_authorized_document_or_sidecar(roots, path) {
        "authorized"
    } else {
        "exists"
    }
}

fn is_valid_persisted_markdown_path(value: &str, path: &Path) -> bool {
    if value.trim() != value || !path.is_absolute() || !is_markdown(path) {
        return false;
    }

    // Reject corrupted values such as `I:\\E:\\desktop\\notes.md`. Windows
    // accepts the first drive prefix as an absolute path, so `Path::is_absolute`
    // alone cannot identify the embedded second drive designator. `\\?\E:\...`
    // is different: it is a valid Windows extended-length path and the drive at
    // byte 4 belongs to that prefix rather than being an embedded second drive.
    let valid_drive_index = if value.as_bytes().starts_with(b"\\\\?\\") { 4 } else { 0 };
    !value.as_bytes().windows(3).enumerate().any(|(index, bytes)| {
        index != valid_drive_index
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'\\' | b'/')
    })
}

/// Toggle the native window's always-on-top flag. Kept as a command so the
/// web preview can simply opt out without importing window APIs.
#[tauri::command]
pub fn set_always_on_top(window: WebviewWindow, always_on_top: bool) -> Result<(), String> {
    window
        .set_always_on_top(always_on_top)
        .map_err(|error| error.to_string())
}

/// The two usable halves of a monitor work area.  This is deliberately based
/// on the work area rather than its full resolution, so a snapped reader does
/// not cover the Windows taskbar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SnapBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn snap_bounds(side: &str, x: i32, y: i32, width: u32, height: u32) -> Result<SnapBounds, String> {
    if height == 0 || width < 2 {
        return Err("The current display work area is too small to snap this window.".to_string());
    }

    let left_width = width / 2;
    let right_width = width - left_width;
    match side {
        "left" => Ok(SnapBounds { x, y, width: left_width, height }),
        "right" => Ok(SnapBounds {
            x: x.saturating_add(left_width as i32),
            y,
            width: right_width,
            height,
        }),
        _ => Err("Window snap side must be either left or right.".to_string()),
    }
}

/// Explicitly place the current reader window into the left or right half of
/// its current Windows monitor.  It never installs a global hotkey or claims
/// to emulate Explorer's system Snap Layouts; this is a user-invoked layout
/// convenience for the live-reading companion workflow.
#[tauri::command]
pub fn snap_window_to_side(window: WebviewWindow, side: String) -> Result<(), String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (window, side);
        return Err("Side snapping is currently available only in the Windows desktop app.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use tauri::{PhysicalPosition, PhysicalSize};

        let monitor = window
            .current_monitor()
            .map_err(|error| error.to_string())?
            .or(window.primary_monitor().map_err(|error| error.to_string())?)
            .ok_or_else(|| "Windows did not report a monitor for this reader window.".to_string())?;
        let work_area = monitor.work_area();
        let bounds = snap_bounds(
            &side,
            work_area.position.x,
            work_area.position.y,
            work_area.size.width,
            work_area.size.height,
        )?;

        // Resize before moving so the user never observes a frame temporarily
        // stretched across a second monitor.
        window
            .set_size(PhysicalSize::new(bounds.width, bounds.height))
            .map_err(|error| error.to_string())?;
        window
            .set_position(PhysicalPosition::new(bounds.x, bounds.y))
            .map_err(|error| error.to_string())
    }
}

fn is_markdown(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        })
}

fn filename_sort_key(path: &PathBuf) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_lowercase()
}

/// Find the immediately previous and next Markdown files in the current
/// document's directory. This intentionally does not recurse into children.
#[tauri::command]
pub fn adjacent_markdown_paths(roots: tauri::State<AuthorizedDocumentRoots>, current_path: String) -> Result<AdjacentMarkdownPaths, String> {
    let current = PathBuf::from(current_path);
    if !is_authorized_document_or_sidecar(&roots, &current) {
        return Err("This path was not authorized by a native document picker or file association.".to_string());
    }
    let directory = current
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "The document path has no parent directory.".to_string())?;
    let current = current.canonicalize().unwrap_or(current);

    let mut markdown_files = fs::read_dir(directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && is_markdown(path))
        .collect::<Vec<_>>();
    markdown_files.sort_by_key(filename_sort_key);

    let current_index = markdown_files
        .iter()
        .position(|path| path.canonicalize().unwrap_or_else(|_| path.clone()) == current);
    let Some(index) = current_index else {
        return Ok(AdjacentMarkdownPaths {
            previous: None,
            next: None,
        });
    };

    Ok(AdjacentMarkdownPaths {
        previous: index
            .checked_sub(1)
            .and_then(|previous| markdown_files.get(previous))
            .map(|path| path.to_string_lossy().into_owned()),
        next: markdown_files
            .get(index + 1)
            .map(|path| path.to_string_lossy().into_owned()),
    })
}

/// Metadata for one explicit relative resource reference in a Markdown file.
///
/// The command deliberately accepts references rather than walking the document
/// tree: callers decide what was referenced and this code only checks those
/// paths below the opened document's directory.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalResourceInventoryItem {
    pub reference: String,
    pub exists: bool,
    pub byte_length: Option<u64>,
    pub is_image: bool,
}

fn is_image_extension(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png"
                    | "jpg"
                    | "jpeg"
                    | "gif"
                    | "webp"
                    | "svg"
                    | "bmp"
                    | "avif"
                    | "ico"
                    | "tif"
                    | "tiff"
            )
        })
}

/// Converts a Markdown relative URL to a safe path below `root`.
///
/// This rejects URI schemes, drive/prefix paths, roots and every `..` component
/// before touching the filesystem.  For an existing target, canonicalization
/// also prevents a symlink from escaping the document directory.
fn resource_path_below_root(root: &Path, reference: &str) -> Option<PathBuf> {
    let file_part = reference.split(['#', '?']).next().unwrap_or_default();
    if file_part.is_empty()
        || file_part.contains("://")
        || file_part.starts_with('/')
        || file_part.starts_with('\\')
    {
        return None;
    }

    let relative = Path::new(file_part);
    let mut candidate = root.to_path_buf();
    for component in relative.components() {
        match component {
            std::path::Component::Normal(part) => candidate.push(part),
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir
            | std::path::Component::RootDir
            | std::path::Component::Prefix(_) => return None,
        }
    }
    Some(candidate)
}

/// Inspects explicit relative Markdown resource references without recursive
/// enumeration. It is intentionally scoped to the selected document's parent
/// directory and rejects references which could escape that directory.
#[tauri::command]
pub fn inspect_local_resources(
    roots: tauri::State<AuthorizedDocumentRoots>,
    document_path: String,
    references: Vec<String>,
) -> Result<Vec<LocalResourceInventoryItem>, String> {
    inspect_local_resources_for_roots(roots.inner(), document_path, references)
}

fn inspect_local_resources_for_roots(
    roots: &AuthorizedDocumentRoots,
    document_path: String,
    references: Vec<String>,
) -> Result<Vec<LocalResourceInventoryItem>, String> {
    let document = PathBuf::from(document_path)
        .canonicalize()
        .map_err(|error| format!("Unable to resolve document path: {error}"))?;
    if !document.is_file() {
        return Err("The supplied document path is not a file.".to_string());
    }
    if !is_authorized_document_or_sidecar(roots, &document) {
        return Err("This document was not authorized by a native document picker or file association.".to_string());
    }
    let root = document
        .parent()
        .ok_or_else(|| "The document path has no parent directory.".to_string())?;

    Ok(references
        .into_iter()
        .map(|reference| {
            let Some(candidate) = resource_path_below_root(root, &reference) else {
                return LocalResourceInventoryItem {
                    is_image: is_image_extension(Path::new(
                        reference.split(['#', '?']).next().unwrap_or_default(),
                    )),
                    reference,
                    exists: false,
                    byte_length: None,
                };
            };
            let is_image = is_image_extension(&candidate);
            let metadata = match candidate.canonicalize() {
                Ok(canonical) if canonical.starts_with(root) => fs::metadata(canonical).ok(),
                _ => None,
            };
            LocalResourceInventoryItem {
                reference,
                exists: metadata.as_ref().is_some_and(|meta| meta.is_file()),
                byte_length: metadata
                    .filter(|meta| meta.is_file())
                    .map(|meta| meta.len()),
                is_image,
            }
        })
        .collect())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBinaryResource {
    pub mime_type: String,
    pub data_base64: String,
}

fn image_mime_type(path: &Path) -> Option<&'static str> {
    match path.extension()?.to_string_lossy().to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

fn read_verified_image_for_roots(
    roots: &AuthorizedDocumentRoots,
    document_path: String,
    reference: String,
) -> Result<ExportBinaryResource, String> {
    let document = PathBuf::from(document_path).canonicalize().map_err(|error| format!("Unable to resolve document path: {error}"))?;
    if !document.is_file() || !is_authorized_document_or_sidecar(roots, &document) {
        return Err("This document was not authorized by a native document picker or file association.".to_string());
    }
    let root = document.parent().ok_or_else(|| "The document path has no parent directory.".to_string())?;
    let candidate = resource_path_below_root(root, &reference).ok_or_else(|| "Only relative local image references can be exported.".to_string())?;
    let canonical = candidate.canonicalize().map_err(|_| "The referenced image no longer exists.".to_string())?;
    let mime_type = image_mime_type(&canonical).ok_or_else(|| "The referenced resource is not a supported image.".to_string())?;
    if !canonical.starts_with(root) || !canonical.is_file() {
        return Err("The referenced image is outside this document folder.".to_string());
    }
    let metadata = fs::metadata(&canonical).map_err(|error| error.to_string())?;
    if metadata.len() > 20 * 1024 * 1024 {
        return Err("The referenced image exceeds the 20 MB export limit.".to_string());
    }
    let bytes = fs::read(canonical).map_err(|error| error.to_string())?;
    Ok(ExportBinaryResource {
        mime_type: mime_type.to_string(),
        data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

#[tauri::command]
pub fn read_verified_local_image(
    roots: tauri::State<AuthorizedDocumentRoots>,
    document_path: String,
    reference: String,
) -> Result<ExportBinaryResource, String> {
    read_verified_image_for_roots(roots.inner(), document_path, reference)
}

#[tauri::command]
pub fn read_windows_cjk_font() -> Result<ExportBinaryResource, String> {
    #[cfg(windows)]
    {
        let windows = std::env::var_os("WINDIR").map(PathBuf::from).unwrap_or_else(|| PathBuf::from(r"C:\Windows"));
        for name in ["simhei.ttf", "NotoSansSC-VF.ttf", "simsunb.ttf"] {
            let candidate = windows.join("Fonts").join(name);
            if let Ok(bytes) = fs::read(candidate) {
                return Ok(ExportBinaryResource {
                    mime_type: "font/ttf".to_string(),
                    data_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
                });
            }
        }
        Err("No supported Windows CJK TrueType font was found.".to_string())
    }
    #[cfg(not(windows))]
    {
        Err("The bundled CJK font resolver is available only on Windows.".to_string())
    }
}
use serde::Serialize;
use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::FsExt;
use tauri_plugin_shell::ShellExt;

#[derive(Serialize)]
pub struct AdjacentMarkdownPaths {
    pub previous: Option<String>,
    pub next: Option<String>,
}

/// A bounded snapshot of Markdown files below the directory selected by the
/// operating-system picker.  The renderer uses it for project diagnostics; it
/// is never a general-purpose filesystem enumeration API.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMarkdownDocument {
    pub path: String,
    pub markdown: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMarkdownScan {
    pub documents: Vec<ProjectMarkdownDocument>,
    /// A partial scan must not be presented as a complete project diagnosis.
    pub truncated: bool,
}

const PROJECT_SCAN_MAX_DOCUMENTS: usize = 200;
const PROJECT_SCAN_MAX_BYTES: u64 = 2 * 1024 * 1024;

/// Recursively reads only Markdown documents below the already-authorized
/// current document directory.  Symlinks, non-Markdown files and oversized
/// projects are deliberately excluded, so a project-roam request cannot
/// expand the picker/file-association permission boundary.
#[tauri::command]
pub fn scan_authorized_project_markdown(
    roots: tauri::State<AuthorizedDocumentRoots>,
    current_path: String,
) -> Result<ProjectMarkdownScan, String> {
    let current = PathBuf::from(current_path).canonicalize().map_err(|error| error.to_string())?;
    if !is_authorized_document_or_sidecar(&roots, &current) || !is_markdown(&current) {
        return Err("This document was not authorized by a native document picker or file association.".to_string());
    }
    let root = current.parent().ok_or_else(|| "The document path has no parent directory.".to_string())?.to_path_buf();
    let mut pending = vec![root.clone()];
    let mut documents = Vec::new();
    let mut total_bytes = 0_u64;
    let mut truncated = false;

    while let Some(directory) = pending.pop() {
        let entries = fs::read_dir(&directory).map_err(|error| error.to_string())?;
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let metadata = match fs::symlink_metadata(&path) { Ok(metadata) => metadata, Err(_) => continue };
            if metadata.file_type().is_symlink() { continue; }
            if metadata.is_dir() {
                pending.push(path);
                continue;
            }
            if !metadata.is_file() || !is_markdown(&path) { continue; }
            if documents.len() >= PROJECT_SCAN_MAX_DOCUMENTS || total_bytes.saturating_add(metadata.len()) > PROJECT_SCAN_MAX_BYTES {
                truncated = true;
                continue;
            }
            let canonical = match path.canonicalize() { Ok(path) if path.starts_with(&root) => path, _ => continue };
            let bytes = match fs::read(&canonical) { Ok(bytes) => bytes, Err(_) => continue };
            let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
            let markdown = match std::str::from_utf8(bytes) {
                Ok(text) => text.to_owned(),
                Err(_) => {
                    let (decoded, _, had_errors) = encoding_rs::GB18030.decode(bytes);
                    if had_errors { continue; }
                    decoded.into_owned()
                }
            };
            total_bytes = total_bytes.saturating_add(metadata.len());
            documents.push(ProjectMarkdownDocument { path: canonical.to_string_lossy().into_owned(), markdown });
        }
    }
    documents.sort_by(|left, right| left.path.to_lowercase().cmp(&right.path.to_lowercase()));
    Ok(ProjectMarkdownScan { documents, truncated })
}

/// Opens a Markdown-authored image only after resolving it below the current
/// document's directory. The canonical path is checked again at use time.
#[tauri::command]
pub fn open_verified_local_image(
    app: tauri::AppHandle,
    roots: tauri::State<AuthorizedDocumentRoots>,
    document_path: String,
    reference: String,
) -> Result<(), String> {
    let document = PathBuf::from(document_path)
        .canonicalize()
        .map_err(|error| format!("Unable to resolve document path: {error}"))?;
    if !document.is_file() {
        return Err("The supplied document path is not a file.".to_string());
    }
    if !is_authorized_document_or_sidecar(&roots, &document) {
        return Err("This document was not authorized by a native document picker or file association.".to_string());
    }
    let root = document.parent().ok_or_else(|| "The document path has no parent directory.".to_string())?;
    let candidate = resource_path_below_root(root, &reference)
        .ok_or_else(|| "Only relative local image references can be opened.".to_string())?;
    let canonical = candidate.canonicalize().map_err(|_| "The referenced image no longer exists.".to_string())?;
    if !canonical.starts_with(root) || !canonical.is_file() || !is_image_extension(&canonical) {
        return Err("The referenced resource is not an image inside this document folder.".to_string());
    }
    #[allow(deprecated)]
    app.shell().open(canonical.to_string_lossy().into_owned(), None)
        .map_err(|error| format!("Unable to open the referenced image: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_directory(label: &str) -> PathBuf {
        let directory = std::env::temp_dir().join(format!(
            "md-reader-{label}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock before Unix epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&directory).expect("create temporary directory");
        directory
    }

    #[test]
    fn startup_path_only_accepts_markdown_extensions() {
        assert!(is_markdown(Path::new("guide.MD")));
        assert!(is_markdown(Path::new("guide.markdown")));
        assert!(!is_markdown(Path::new("guide.txt")));
    }

    #[test]
    fn snap_bounds_split_the_work_area_without_covering_its_edges() {
        assert_eq!(
            snap_bounds("left", -1920, 30, 1921, 1040).unwrap(),
            SnapBounds { x: -1920, y: 30, width: 960, height: 1040 }
        );
        assert_eq!(
            snap_bounds("right", -1920, 30, 1921, 1040).unwrap(),
            SnapBounds { x: -960, y: 30, width: 961, height: 1040 }
        );
    }

    #[test]
    fn snap_bounds_reject_invalid_sides_and_tiny_work_areas() {
        assert!(snap_bounds("top", 0, 0, 1920, 1080).is_err());
        assert!(snap_bounds("left", 0, 0, 1, 1080).is_err());
    }

    #[test]
    fn resource_paths_cannot_escape_the_document_directory() {
        let root = temporary_directory("resource-path");
        assert_eq!(
            resource_path_below_root(&root, "assets/diagram.png"),
            Some(root.join("assets").join("diagram.png"))
        );
        for unsafe_reference in [
            "../secret.txt",
            "C:\\Windows\\win.ini",
            "/etc/passwd",
            "https://example.com/a.png",
            "#section",
        ] {
            assert!(
                resource_path_below_root(&root, unsafe_reference).is_none(),
                "{unsafe_reference}"
            );
        }
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn resource_inventory_reports_explicit_relative_files_only() {
        let root = temporary_directory("resource-inventory");
        let document = root.join("notes.md");
        let assets = root.join("assets");
        fs::create_dir_all(&assets).expect("create assets directory");
        fs::write(&document, "![diagram](assets/diagram.png)").expect("write document");
        fs::write(assets.join("diagram.png"), [1_u8, 2, 3, 4]).expect("write image");

        let authorized = AuthorizedDocumentRoots::default();
        authorized.0.lock().expect("lock access state").push(root.canonicalize().expect("canonical root"));
        let inventory = inspect_local_resources_for_roots(
            &authorized,
            document.to_string_lossy().into_owned(),
            vec![
                "assets/diagram.png".to_string(),
                "assets/missing.svg".to_string(),
                "../outside.png".to_string(),
            ],
        )
        .expect("inspect local resources");

        assert_eq!(
            inventory[0],
            LocalResourceInventoryItem {
                reference: "assets/diagram.png".to_string(),
                exists: true,
                byte_length: Some(4),
                is_image: true,
            }
        );
        assert_eq!(inventory[1].exists, false);
        assert!(inventory[1].is_image);
        assert_eq!(inventory[2].exists, false);
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn export_image_reader_returns_only_an_authorized_relative_image() {
        let root = temporary_directory("export-image-reader");
        let document = root.join("notes.md");
        let assets = root.join("assets");
        fs::create_dir_all(&assets).expect("create assets directory");
        fs::write(&document, "![diagram](assets/diagram.png)").expect("write document");
        fs::write(assets.join("diagram.png"), [0x89_u8, b'P', b'N', b'G']).expect("write image");
        fs::write(root.join("secret.png"), [1_u8, 2, 3]).expect("write secret");

        let authorized = AuthorizedDocumentRoots::default();
        authorized.0.lock().expect("lock access state").push(root.canonicalize().expect("canonical root"));
        let resource = read_verified_image_for_roots(
            &authorized,
            document.to_string_lossy().into_owned(),
            "assets/diagram.png".to_string(),
        ).expect("read authorized image");
        assert_eq!(resource.mime_type, "image/png");
        assert_eq!(resource.data_base64, "iVBORw==");
        assert!(read_verified_image_for_roots(
            &authorized,
            document.to_string_lossy().into_owned(),
            "../secret.png".to_string(),
        ).is_err());
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn authorization_allows_only_markdown_and_its_sidecar_below_selected_directory() {
        let root = temporary_directory("authorization");
        let document = root.join("notes.md");
        let sidecar = root.join("notes.md.mdreader.json");
        let secret = root.join("secret.txt");
        fs::write(&document, "# Notes").expect("write document");
        fs::write(&sidecar, "{}").expect("write sidecar");
        fs::write(&secret, "not markdown").expect("write secret");
        let authorized = AuthorizedDocumentRoots::default();
        authorized.0.lock().expect("lock access state").push(root.canonicalize().expect("canonical root"));
        assert!(is_authorized_document_or_sidecar(&authorized, &document));
        assert!(is_authorized_document_or_sidecar(&authorized, &sidecar));
        assert!(!is_authorized_document_or_sidecar(&authorized, &secret));
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn atomic_replace_overwrites_an_existing_document() {
        let root = temporary_directory("atomic-replace");
        let target = root.join("notes.md");
        let temporary = root.join(".notes.md.test.tmp");
        fs::write(&target, "old content").expect("write existing target");
        fs::write(&temporary, "new content").expect("write replacement");

        replace_file_atomically(&temporary, &target).expect("replace existing target");

        assert_eq!(fs::read_to_string(&target).expect("read replaced target"), "new content");
        assert!(!temporary.exists());
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn writer_and_reader_accept_the_same_approved_sidecars() {
        for name in ["notes.md.mdreader.json", "notes.md.mdreader.tables.json"] {
            assert!(is_approved_sidecar_name(Path::new(name)), "{name}");
            assert!(is_authorized_writer_name(Path::new(name)), "{name}");
        }
        assert!(!is_approved_sidecar_name(Path::new("notes.mdreader.txt")));
    }

    #[test]
    fn persisted_history_paths_reject_an_embedded_second_drive() {
        assert!(!is_valid_persisted_markdown_path(
            "I:\\E:\\desktop\\notes.md",
            Path::new("I:\\E:\\desktop\\notes.md")
        ));
    }

    #[test]
    fn legacy_store_history_yields_only_valid_markdown_grants() {
        let settings = r#"{
          "history": [
            { "path": "C:\\docs\\guide.md" },
            { "path": "C:\\docs\\notes.markdown" },
            { "path": "C:\\docs\\not-markdown.txt" },
            { "path": "I:\\E:\\broken.md" },
            { "title": "missing path" }
          ]
        }"#;
        assert_eq!(
            history_paths_from_settings(settings),
            vec!["C:\\docs\\guide.md", "C:\\docs\\notes.markdown"]
        );
        assert!(history_paths_from_settings("not json").is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn persisted_history_paths_accept_windows_extended_drive_prefix() {
        let value = r"\\?\E:\desktop\notes.md";
        assert!(is_valid_persisted_markdown_path(value, Path::new(value)));
    }

    #[test]
    fn history_status_distinguishes_existing_missing_and_authorized_files() {
        let root = temporary_directory("history-status");
        let document = root.join("notes.md");
        fs::write(&document, "# Notes").expect("write document");
        let authorized = AuthorizedDocumentRoots::default();
        let value = document.to_string_lossy().into_owned();

        assert_eq!(markdown_path_status(&authorized, &value), "exists");
        #[cfg(windows)]
        assert_eq!(
            markdown_path_status(&authorized, &format!(r"\\?\{}", value)),
            "exists"
        );
        authorized.0.lock().expect("lock access state")
            .push(root.canonicalize().expect("canonical root"));
        assert_eq!(markdown_path_status(&authorized, &value), "authorized");
        assert_eq!(
            markdown_path_status(&authorized, &root.join("missing.md").to_string_lossy()),
            "missing"
        );
        fs::remove_dir_all(root).expect("remove temporary directory");
    }

    #[test]
    fn export_targets_are_limited_to_supported_document_formats() {
        assert!(is_export_target(Path::new("report.DOCX")));
        assert!(is_export_target(Path::new("report.pdf")));
        assert!(is_export_target(Path::new("report.xlsx")));
        assert!(!is_export_target(Path::new("report.md")));
        assert!(!is_export_target(Path::new("report.pdf.exe")));
    }
}
