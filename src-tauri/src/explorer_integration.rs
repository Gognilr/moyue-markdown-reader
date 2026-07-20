#[cfg(windows)]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const VERB_KEY: &str = "MarkdownReaderQuickPreview";

#[tauri::command]
pub fn install_explorer_quick_preview() -> Result<(), String> {
    #[cfg(windows)]
    {
        let executable = std::env::current_exe().map_err(|error| error.to_string())?;
        let command = format!("\"{}\" --quick-preview \"%1\"", executable.to_string_lossy());
        let root = RegKey::predef(HKEY_CURRENT_USER);
        for extension in [".md", ".markdown"] {
            let base = format!("Software\\Classes\\SystemFileAssociations\\{extension}\\shell\\{VERB_KEY}");
            let (verb, _) = root.create_subkey(&base).map_err(|error| error.to_string())?;
            verb.set_value("", &"使用 Markdown Reader 快速预览").map_err(|error| error.to_string())?;
            verb.set_value("Icon", &executable.to_string_lossy().to_string()).map_err(|error| error.to_string())?;
            let (command_key, _) = verb.create_subkey("command").map_err(|error| error.to_string())?;
            command_key.set_value("", &command).map_err(|error| error.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    Err("Explorer quick preview is available only on Windows.".to_string())
}

#[tauri::command]
pub fn remove_explorer_quick_preview() -> Result<(), String> {
    #[cfg(windows)]
    {
        let root = RegKey::predef(HKEY_CURRENT_USER);
        for extension in [".md", ".markdown"] {
            let path = format!("Software\\Classes\\SystemFileAssociations\\{extension}\\shell\\{VERB_KEY}");
            match root.delete_subkey_all(&path) {
                Ok(()) => {},
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {},
                Err(error) => return Err(error.to_string()),
            }
        }
        Ok(())
    }
    #[cfg(not(windows))]
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explorer_verb_has_a_stable_uninstall_key() { assert_eq!(VERB_KEY, "MarkdownReaderQuickPreview"); }
}
