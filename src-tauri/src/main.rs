// Prevents additional console window on Windows in release, do not remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod explorer_integration;
mod jump_list;
mod preview;

fn main() {
    tauri::Builder::default()
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
