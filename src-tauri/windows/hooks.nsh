!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.md\shell\MarkdownReaderQuickPreview"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.markdown\shell\MarkdownReaderQuickPreview"
!macroend

; Tauri creates the desktop shortcut before this hook. Recreate it with an
; explicit icon target so Windows does not retain a stale shell-link icon when
; the application icon changes during an in-place upgrade.
!macro NSIS_HOOK_POSTINSTALL
  ; Remove the legacy desktop link after the product was renamed.
  Delete "$DESKTOP\Markdown阅读器.lnk"
  Delete "$DESKTOP\${PRODUCTNAME}.lnk"
  CreateShortCut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\moyue-brand-crisp.ico" 0
  ; Ask Explorer to invalidate its view without terminating the user's shell.
  Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend
