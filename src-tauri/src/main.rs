// Prevents additional console window on Windows in release, do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod explorer_integration;
mod jump_list;
mod preview;

use tauri::{Emitter, Manager};

/// 主窗口收到第二实例双击文件的事件名（前端监听后打开该路径）。
pub const OPEN_EXTERNAL_FILE_EVENT: &str = "md-reader:open-external-file";

fn main() {
    tauri::Builder::default()
        // 单实例插件必须最先注册：第二个进程启动时，把它的命令行参数
        // （文件关联路径或 --quick-preview）转发给已在运行的实例处理。
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let arguments: Vec<String> = argv.into_iter().skip(1).collect();

            // 资源管理器右键“快速预览”：复用当前实例的预览窗口。
            if let Some(index) = arguments.iter().position(|argument| argument == "--quick-preview") {
                if let Some(path) = arguments.get(index + 1) {
                    let state = app.state::<preview::PreviewState>();
                    let roots = app.state::<commands::AuthorizedDocumentRoots>();
                    if let Err(error) = preview::open_preview_window(app, &state, &roots, path) {
                        eprintln!("Unable to route quick preview request: {error}");
                    }
                }
                return;
            }

            // 文件关联双击：授权后通知主窗口打开，并聚焦主窗口。
            if let Some(path) = arguments.iter().find(|argument| {
                let lower = argument.to_ascii_lowercase();
                (lower.ends_with(".md") || lower.ends_with(".markdown"))
                    && std::path::Path::new(argument).is_file()
            }) {
                let roots = app.state::<commands::AuthorizedDocumentRoots>();
                match commands::grant_document_directory(app, &roots, std::path::Path::new(path)) {
                    Ok(canonical) => {
                        if let Err(error) = app.emit(OPEN_EXTERNAL_FILE_EVENT, canonical.to_string_lossy().into_owned()) {
                            eprintln!("Unable to deliver file-association path to the main window: {error}");
                        }
                    }
                    Err(error) => eprintln!("Unable to authorize file-association path: {error}"),
                }
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(preview::PreviewState::default())
        .manage(commands::AuthorizedDocumentRoots::default())
        .manage(commands::AuthorizedExportTargets::default())
        .invoke_handler(tauri::generate_handler![
            commands::export_pdf_placeholder,
            commands::register_file_association_placeholder,
            commands::startup_markdown_path,
            commands::startup_quick_preview_path,
            commands::pick_markdown_document,
            commands::pick_open_package,
            commands::pick_markdown_save_path,
            commands::pick_export_save_path,
            commands::write_markdown_text,
            commands::write_export_binary,
            commands::read_markdown_text,
            commands::inspect_markdown_path_status,
            commands::set_always_on_top,
            commands::snap_window_to_side,
            commands::adjacent_markdown_paths,
            commands::scan_authorized_project_markdown,
            commands::inspect_local_resources,
            commands::read_verified_local_image,
            commands::read_windows_cjk_font,
            commands::open_verified_local_image,
            jump_list::sync_windows_jump_list,
            explorer_integration::install_explorer_quick_preview,
            explorer_integration::remove_explorer_quick_preview,
            preview::open_markdown_preview,
            preview::open_live_mirror_preview,
            preview::preview_markdown_path,
            preview::live_mirror_preview_snapshot,
            preview::preview_session_kind,
            preview::close_markdown_preview,
            preview::promote_markdown_preview,
            preview::navigate_markdown_preview
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
