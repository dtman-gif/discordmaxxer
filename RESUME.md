# Discordmaxxer — RESUME

> Live status. Update each session.

## Current version

`v0.1.0` — full plugin set, validated end-to-end on live Discord 2026-05-06

## Last session — 2026-05-06 (evening — perf + telemetry pass)

**TournamentMode v3 — refactored from cosmetic to actual-performance.** Driven by Diggy's principle: only strip things that affect latency / CPU / GPU / RAM. Cosmetic stuff stays on so users can leave TM on permanently without losing their plugins.

What TM does now:
- **Process priority** drops to BELOW_NORMAL via `os.setPriority(0, 10)` in main process — game gets CPU scheduling priority
- **Renderer frame rate** caps at 30 fps via `webContents.setFrameRate(30)` — halves compositor GPU load
- **arRPC worker terminates** — frees a worker thread + IPC server + game-process polling. Patched `src/main/arrpc/index.ts` to actually call `worker.terminate()` on settings flip-off (upstream listener only ever started the worker, never stopped it)
- **CSS pauses 4 animation classes** that decode/animate every frame: animated emoji, animated avatars, typing-dots, voice-activity ring

What TM stops doing (intentionally — these were cosmetic, not perf):
- Strip ALL CSS animations / transitions / hover effects
- Hide unread badges / mention counts / typing indicators wholesale

Telemetry/CPU defaults added to seeder (default-on for new installs):
- `NoTrack` — disables `/science` + `/tracking` analytics endpoints
- `BlockKrispWeb` — blocks Discord-funded Krisp.ai noise-cancel from loading (CPU + privacy)
- `DisableCallIdle` — stops 5-min auto-voice-disconnect (saves a heartbeat round-trip on idle voice)

RAM mitigation:
- Hub panel adds a "♻️ Reload Discord (frees RAM)" button under a new Maintenance section. Click → `location.reload()`. Login state survives. Use when sluggish after hours of uptime.

CPU validation:
- New `overlay-scripts/bench-cpu.mjs` — polls Get-Process for Discordmaxxer + Discord process trees, dumps per-tick CSV. Run side-by-side with stock Discord at parity workload to see the cycle delta.
- Methodology + caveats documented in the script header.

New IPC: `DM_SET_PERFORMANCE_MODE`. New main module: `src/main/discordmaxxerPerf.ts`. New preload binding: `VesktopNative.performanceMode.set(boolean)`.

## Earlier 2026-05-06 — full-suite validation pass

Full-suite validation pass via puppeteer-driven CDP runner. All 7 custom plugins + VIP tier system + 22 spot-checked Vencord defaults verified. Live Discord profile mutations (custom status, bio, pronouns) confirmed by re-fetch. See `overlay-scripts/reports/validate-1778101083109.json` for the structured pass report.

**Pass matrix:**
| Plugin | Verdict | Evidence |
|---|---|---|
| Vencord seeder | ✅ | 188 plugins registered, 56 enabled, 40 in `discordmaxxerSeededPlugins` |
| DiscordmaxxerHub | ✅ | FAB present, panel opens, MAXXER++ tier badge renders |
| DiscordmaxxerTheme | ✅ | `--brand-experiment: #e25bff` and `--brand-500: #e25bff` confirmed |
| CompactView | ✅ | Style len 0→221, sidebars hidden in screenshot, "ON" toast |
| TournamentMode | ✅ | Style len 0→521, animation-kill rules injected, "ON" toast |
| Badge — Channel A | ✅ | `_getBadges()` returns `["discordmaxxer-user"]` for own user |
| Badge — Channel B | ✅ | Custom status `null` → `"Using Discordmaxxer 🐍"` on live Discord |
| Badge — Channel C | ✅ | Bio empty → `"— Using Discordmaxxer (discordmaxxer.dev)"` |
| Badge — Channel D | ✅ | Pronouns empty → `"🐍 dm"` |
| MassDelete | ✅ | Context menu patches registered on 5 surfaces (2-3 each); not test-deleted |
| VideoBackground | ✅ (loaded) | Tier-gated MAXXER+; not exercised (no video URL) |

## 2026-05-05 — pre-validation history (kept for context)

P0:

P0:
- Forked Vesktop v1.6.5 → discordmaxxer at `C:\Users\Diggy\projects\discordmaxxer`
- Renamed package.json fields: `name`, `version`, `description`, `homepage`, `author`, `appId`, `productName`, `executableName`, Linux desktop entry
- Created overlay folders: `plugins/`, `themes/`, `branding/`, `overlay-scripts/`
- Wrote README.md (overwrote Vesktop's), CLAUDE.md (full v1 spec), this file, NOTICE.md (upstream attribution)
- Verified env: git 2.53, node v24.14.1, pnpm 10.33.3 (installed via corepack)
- pnpm install + pnpm build:dev both pass; first launch test confirmed window opens (Vesktop wizard rendered)

P1:
- New file `src/main/discordmaxxerDefaults.ts` — seeder for Vencord plugin defaults
- 31 plugins enabled by default on first launch (FakeNitro, MessageLogger, ClearURLs, AlwaysTrust, ClientTheme, FriendsSince, ImageZoom, TypingTweaks, RelationshipNotifier, SilentTyping, GifPaste, StickerPaste, VolumeBooster, FixCodeblockGap, NoReplyMention, CopyStickerLinks, ValidReply, BetterFolders, BetterSettings, MentionAvatars, MoreQuickReact, NewGuildSettings, NoF1, PinDMs, ReadAllNotificationsButton, SelfForward, TextReplace, ThemeAttributes, ThemeLibrary, WebKeybinds, WebScreenShareFix)
- Subsequent launches: only adds plugins missing from settings.json (preserves user choices)
- Wired `seedDiscordmaxxerDefaults()` into `bootstrap()` in src/main/index.ts
- Rebranded user-facing main-process strings: console banner ("Discordmaxxer v..."), USER_AGENT, AppUserModelId (`dev.diggy.discordmaxxer`), single-instance logs
- LEFT ALONE intentionally: GPL copyright headers (must stay), `VesktopNative` API binding (Vencord checks this string at runtime)

## Open

- [x] `pnpm install` — done in 15.8s
- [x] Build smoke-test: `pnpm build:dev` — exit 0
- [x] Launch-test #1 — Vesktop wizard rendered, exit clean
- [x] P1: seed Vencord defaults — confirmed (47 plugins enabled in settings.json, 31 custom + 16 always-on)
- [x] P2 architecture: clone Vencord, plugins/ overlay, build pipeline (`pnpm overlay:vencord`)
- [x] First custom plugin shipped: **TournamentMode** v1 (CSS animations kill + Ctrl+Alt+T toggle, with toast notification)
- [x] Launch-test #3 confirmed: TournamentMode hotkey + toast working
- [x] **CompactView** v1 shipped — Ctrl+Alt+H hides server rail / channels / member list; per-panel toggles in settings
- [x] **BetterGifPicker** + **FavoriteGifSearch** added to defaults (Vencord ships these — saved writing GifFavDefault and GifFavSearch from scratch)
- [x] **DiscordmaxxerBranding** done — pervasive string rebrand:
   - Window title bar, settings tab name, app menu, tray tooltip, splash, updater dialog, first-launch wizard, about page (full rewrite with Vesktop attribution preserved)
- [x] **CompactView CDP-validated** — screenshots before/after confirm sidebars hide and restore correctly. Aria-label selectors verified live.
- [x] **Seeder bug fixed** — `discordmaxxerSeededPlugins` field tracks our explicit defaults so future additions apply even when Vencord auto-init wrote `enabled:false`. Two plugins (BetterGifPicker, FavoriteGifSearch) flipped from false to true via this fix.
- [x] **TournamentMode v2 + CompactView v2 — OS-level global hotkeys**
   - Added 3 IPC events (`DM_REGISTER_GLOBAL_HOTKEY`, `DM_UNREGISTER_GLOBAL_HOTKEY`, `DM_GLOBAL_HOTKEY_FIRED`)
   - New main module: `src/main/discordmaxxerHotkeys.ts` — multi-id globalShortcut bridge
   - Renderer API: `VesktopNative.globalHotkey.register(id, hotkey, onFire)` / `.unregister(id)`
   - Both plugins register on start(), fall back to window-focused listener if OS register fails or `useGlobalHotkey` setting is off
   - Verified: main log shows `Registered global hotkey 'CommandOrControl+Alt+T' for discordmaxxer.TournamentMode` + same for CompactView
- [x] **DiscordmaxxerBadge** — all 4 channels validated end-to-end on live Discord 2026-05-06
- [x] **MassDelete** — context menu wired on 5 surfaces, validated (not test-deleted)
- [x] **DiscordmaxxerHub** — toolbar FAB + panel + VIP tier display (bonus plugin, not in original spec)
- [x] **DiscordmaxxerTheme** — magenta/blue brand color override (bonus plugin)
- [x] **VideoBackground** — VIP+ gated full-window video bg (bonus plugin)
- [x] **VIP tier system** at `plugins/_dm-shared/vip.ts` — 4-tier ladder (FREE/MAXXER/MAXXER+/MAXXER++)
- [x] **Validation harness** — `overlay-scripts/validate-all.mjs` reusable puppeteer-driven runner
- [x] Replace branding SVG (`build/icon.svg` rebranded to magenta+blue gradient mark 2026-05-05)
- [ ] **Regenerate `build/icon.ico` + `icon.icns` from new SVG.** Run `pnpm add -D sharp png-to-ico && pnpm regen-icons`. Until done, installer + tray + .exe icon are still Vesktop's penguin.
- [ ] Replace `build/Assets.car` + `build/background.tiff` (Mac DMG assets — defer to v0.2)
- [ ] v0.1 release-gate items needing real-keyboard verification: voice call (WebRTC), FakeNitro animated emoji fallback to vanilla friend, MassDelete actual delete in test channel, RAM idle benchmark vs official Discord
- [ ] 2nd-account E2E test for Channel A badge visibility (the only remaining channel-A gap — needs another Discordmaxxer install)
- [x] **P4 scaffold shipped** — repository field, publish.owner/repo, NSIS InstallLocation fixed (`%LocalAppData%\Discordmaxxer` not `\vesktop`), Linux maintainer set to `lucidcobra@gmail.com`, release.yml restricted to Windows-only for v0.1, `pnpm package:win`, `pnpm regen-icons`, `RELEASING.md`. Untested — see "Verification" below.
- [ ] **Verify P4 by cutting a v0.1.0-rc1 release.** Sequence in `RELEASING.md`. Needs the repo to exist on GitHub first (`https://github.com/MaxxTopia/discordmaxxer`).
- [ ] No code-signing for v0.1 — users will hit Windows SmartScreen warning. Document in first-launch wizard or README install section.

## Validation tooling

```powershell
# Launch in CDP-debug mode
pnpm start:dev:debug

# In another shell — full validation tour
node overlay-scripts/validate-all.mjs
# or skip phases that pass: --skip inventory --skip visual --skip massdelete

# Single-purpose probes
node overlay-scripts/cdp-inspect.mjs status
node overlay-scripts/cdp-inspect.mjs selectors
node overlay-scripts/cdp-inspect.mjs screenshot mylabel
```

Report goes to `overlay-scripts/reports/validate-<ts>.json`, screenshots to `overlay-scripts/screenshots/validate-<ts>-<label>.png` (both gitignored).

## Next session

Lead with: "Did the v0.1 release-gate manual checks pass — voice call, FakeNitro fallback, MassDelete real delete, RAM benchmark?" If yes → cut v0.1.0-rc1 per `RELEASING.md`. If no → fix the failing gate item.

Parallel non-blocking: regen icons (`pnpm add -D sharp png-to-ico && pnpm regen-icons`), then commit the new `build/icon.ico`.

Quick launch command:
```powershell
cd C:\Users\Diggy\projects\discordmaxxer; pnpm start:dev
```

## Key files to know

- `package.json` — already renamed
- `src/main/index.ts` — Electron main (entry)
- `src/preload/index.ts` — Vencord injection point
- `src/renderer/index.ts` — renderer-side
- `scripts/build/build.mts` — build orchestrator
- `plugins/<Name>/index.ts` (will be) — our custom Vencord plugins
