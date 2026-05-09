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
!macro customInstall
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -show'
!macroend

; Same on uninstall — drops the now-stale Discordmaxxer icon entry from
; cache so an immediate reinstall picks up the fresh binary's icon.
!macro customUnInstall
  nsExec::Exec '"$SYSDIR\ie4uinit.exe" -ClearIconCache'
!macroend
