!macro preInit
 SetRegView 64
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$LocalAppData\Discordmaxxer"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LocalAppData\Discordmaxxer"
 SetRegView 32
  WriteRegExpandStr HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation "$LocalAppData\Discordmaxxer"
  WriteRegExpandStr HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation "$LocalAppData\Discordmaxxer"
!macroend

; Clear Windows icon cache after install so the new app icon shows up
; immediately in taskbar / Start Menu / desktop shortcuts. Without this,
; Windows holds the previous version's icon in cache for hours/days.
; ie4uinit -ClearIconCache works without admin and runs near-instantly.
;
; Then override the auto-generated Start Menu and Desktop shortcuts to
; point at $INSTDIR\resources\shortcut-icon.ico instead of the .exe's
; embedded icon. The .exe icon is the no-bullet-holes Clyde (drives
; the pinned taskbar slot — bullet holes blur to noise at 16-32px),
; while the shortcut surfaces keep the bullet-holes character intact.
; Background: Windows uses the .exe's embedded icon for pinned taskbar
; slots regardless of BrowserWindow.setIcon(), so the only way to have
; a different shortcut icon is to override the .lnk file's icon ref.
!macro customInstall
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'

  ; Override desktop shortcut (created by electron-builder when the
  ; "Create desktop shortcut" install option is checked).
  ${If} ${FileExists} "$DESKTOP\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    CreateShortcut "$DESKTOP\${PRODUCT_NAME}.lnk" \
      "$INSTDIR\${PRODUCT_FILENAME}.exe" "" \
      "$INSTDIR\resources\shortcut-icon.ico" 0
  ${EndIf}

  ; Override Start Menu shortcut (created by electron-builder under
  ; menuCategory if set, else flat in $SMPROGRAMS).
  ${If} ${FileExists} "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    CreateShortcut "$SMPROGRAMS\${PRODUCT_NAME}.lnk" \
      "$INSTDIR\${PRODUCT_FILENAME}.exe" "" \
      "$INSTDIR\resources\shortcut-icon.ico" 0
  ${EndIf}

  ; Force Explorer to refresh the just-rewritten shortcuts.
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend

; Same on uninstall — drops the now-stale Discordmaxxer icon entry from
; cache so an immediate reinstall picks up the fresh binary's icon.
!macro customUnInstall
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
!macroend
