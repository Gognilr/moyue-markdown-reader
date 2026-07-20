use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct JumpListEntry {
    pub path: String,
    pub title: String,
}

fn is_markdown(path: &Path) -> bool {
    path.extension().and_then(|value| value.to_str()).is_some_and(|value|
        value.eq_ignore_ascii_case("md") || value.eq_ignore_ascii_case("markdown"))
}

fn valid_entries(entries: Vec<JumpListEntry>, limit: usize) -> Vec<JumpListEntry> {
    let mut accepted = Vec::new();
    for entry in entries {
        if accepted.len() >= limit { break; }
        let candidate = PathBuf::from(&entry.path);
        if !is_markdown(&candidate) || !candidate.is_file() { continue; }
        let Ok(canonical) = candidate.canonicalize() else { continue; };
        if accepted.iter().any(|item: &JumpListEntry| Path::new(&item.path) == canonical) { continue; }
        accepted.push(JumpListEntry {
            title: entry.title.trim().chars().take(80).collect::<String>(),
            path: canonical.to_string_lossy().into_owned(),
        });
    }
    accepted
}

#[tauri::command]
pub async fn sync_windows_jump_list(recent: Vec<JumpListEntry>, favorites: Vec<JumpListEntry>) -> Result<(), String> {
    let recent = valid_entries(recent, 10);
    let favorites = valid_entries(favorites, 10);
    #[cfg(windows)]
    {
        tauri::async_runtime::spawn_blocking(move || update_windows_jump_list(recent, favorites))
            .await.map_err(|error| error.to_string())?
    }
    #[cfg(not(windows))]
    {
        let _ = (recent, favorites);
        Ok(())
    }
}

#[cfg(windows)]
fn update_windows_jump_list(recent: Vec<JumpListEntry>, favorites: Vec<JumpListEntry>) -> Result<(), String> {
    std::thread::spawn(move || unsafe { update_windows_jump_list_sta(recent, favorites) })
        .join().map_err(|_| "Jump List worker terminated unexpectedly.".to_string())?
}

#[cfg(windows)]
unsafe fn update_windows_jump_list_sta(recent: Vec<JumpListEntry>, favorites: Vec<JumpListEntry>) -> Result<(), String> {
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink};

    CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().map_err(|error| error.to_string())?;
    let result = (|| -> windows::core::Result<()> {
        let destination: ICustomDestinationList = CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        let app_id = wide("com.tabbit.mdreader");
        destination.SetAppID(PCWSTR(app_id.as_ptr()))?;
        let mut maximum_slots = 20;
        let _: IObjectArray = destination.BeginList(&mut maximum_slots)?;
        append_category(&destination, "收藏", &favorites)?;
        append_category(&destination, "最近", &recent)?;
        destination.CommitList()
    })();
    CoUninitialize();
    return result.map_err(|error| error.to_string());

    unsafe fn append_category(destination: &ICustomDestinationList, label: &str, entries: &[JumpListEntry]) -> windows::core::Result<()> {
        if entries.is_empty() { return Ok(()); }
        let collection: IObjectCollection = CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
        let executable = std::env::current_exe().map_err(|error| windows::core::Error::new(windows::core::HRESULT(0x80004005u32 as i32), error.to_string()))?;
        for entry in entries {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
            let executable_wide = wide(&executable.to_string_lossy());
            let arguments_wide = wide(&format!("\"{}\"", entry.path.replace('"', "")));
            link.SetPath(PCWSTR(executable_wide.as_ptr()))?;
            link.SetArguments(PCWSTR(arguments_wide.as_ptr()))?;
            link.SetIconLocation(PCWSTR(executable_wide.as_ptr()), 0)?;
            let properties: IPropertyStore = link.cast()?;
            let title = if entry.title.trim().is_empty() { Path::new(&entry.path).file_stem().and_then(|value| value.to_str()).unwrap_or("Markdown") } else { entry.title.trim() };
            properties.SetValue(&PKEY_Title, &PROPVARIANT::from(title))?;
            properties.Commit()?;
            collection.AddObject(&link)?;
        }
        let title = wide(label);
        destination.AppendCategory(PCWSTR(title.as_ptr()), &collection)
    }

    fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(Some(0)).collect() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn jump_list_accepts_only_existing_markdown_and_deduplicates() {
        let root = std::env::temp_dir().join(format!("md-reader-jump-list-{}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        let markdown = root.join("entry.md");
        let text = root.join("entry.txt");
        fs::write(&markdown, "# Entry").unwrap();
        fs::write(&text, "ignored").unwrap();
        let values = valid_entries(vec![
            JumpListEntry { path: markdown.to_string_lossy().into_owned(), title: "Entry".into() },
            JumpListEntry { path: text.to_string_lossy().into_owned(), title: "Text".into() },
            JumpListEntry { path: markdown.to_string_lossy().into_owned(), title: "Duplicate".into() },
        ], 10);
        assert_eq!(values.len(), 1);
        assert_eq!(values[0].title, "Entry");
        fs::remove_dir_all(root).unwrap();
    }
}
