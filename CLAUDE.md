# Discordmaxxer — v1 spec (CLAUDE.md)

This is the durable spec for the project. For day-to-day status see RESUME.md. For quickstart see README.md.

## Premise

A standalone Discord client branded "Discord, optimized" that ships:
1. Sensible defaults for ~30+ existing Vencord plugins
2. Six original plugins (TournamentMode, CompactView, MassDelete, GifFavDefault, GifFavSearch, DiscordmaxxerBranding, DiscordmaxxerBadge)
3. Custom branding (icon, splash, settings, naming)
4. A viral identity layer (DiscordmaxxerBadge with supporter-unlock removal)

Personal-use first; suite-site distribution later.

## Architecture

Fork of [Vesktop](https://github.com/Vencord/Vesktop) (Electron + bundled Vencord).

```
discordmaxxer/                 (Vesktop fork at root)
├── src/                       (Vesktop source — main process, preload, renderer)
├── packages/                  (Vesktop's libvesktop + venmic native bits)
├── patches/                   (upstream patches to deps — keep in sync)
├── static/                    (assets)
├── scripts/                   (Vesktop build scripts)
│
├── plugins/                   ← OUR overlay: custom Vencord plugins
│   ├── TournamentMode/
│   ├── CompactView/
│   ├── MassDelete/
│   ├── GifFavDefault/
│   ├── GifFavSearch/
│   ├── DiscordmaxxerBranding/
│   └── DiscordmaxxerBadge/
├── themes/                    ← OUR overlay: bundled themes
├── branding/                  ← OUR overlay: icons, splash, wordmark
├── overlay-scripts/           ← OUR build scripts (merge plugins into vencord)
│
├── package.json               (renamed: name=discordmaxxer)
├── README.md                  (overwrites Vesktop's)
├── CLAUDE.md                  (this file)
├── RESUME.md                  (live status)
└── NOTICE.md                  (upstream attribution per GPL-3)
```

**Key: we don't fork Vencord.** We pin a Vencord version via `@vencord/types` (already a dep) and add OUR plugins as side-loaded sources during build. This keeps upstream plugin updates trivial.

## License posture

- **GPL-3.0-or-later** (inherited from Vesktop). No closed-source paid client. Distribution must include source.
- Upstream attribution preserved in NOTICE.md; LICENSE file unchanged.
- Compatible with the suite's "free + optimized" framing.

## Feature inventory

### Pre-enabled Vencord plugins (zero code, default-on config)

Each maps to a feature Diggy specifically asked for:

| User ask | Vencord plugin |
|---|---|
| Fake emojis/stickers + Nitro stream quality | FakeNitro |
| See deleted messages | MessageLogger |
| Auto-remove URL tracking params | ClearURLs |
| Remove untrusted-domain / sus-file popup | AlwaysTrust |
| Crash recovery | CrashHandler |
| Custom Nitro-style themes / bg color | ClientTheme + custom CSS |
| Friends-since on user popout | FriendsSince |
| Image zoom + image quality | ImageZoom |
| Avatars + role colors in typing indicator | TypingTweaks |
| Notify when friend/server removes you | RelationshipNotifier |
| Don't show "is typing" | SilentTyping |
| GIF picker → insert link instead of send | GifPaste |
| Sticker picker → insert instead of send | StickerPaste |
| Volume above 200% | VolumeBooster |
| Fix codeblock gap | FixCodeblockGap |
| Disable reply ping (toggleable) | NoReplyMention |
| Copy/open sticker links | CopyStickerLinks |
| Fix "message could not be loaded" on reply hover | ValidReply |
| Server folders on dedicated sidebar | BetterFolders |
| Enhanced settings menu | BetterSettings |
| Avatars + role icons in @ mentions | MentionAvatars |
| More quick-react buttons | MoreQuickReact |
| Auto-mute new servers + tweak settings on join | NewGuildSettings |
| Disable F1 keybind | NoF1 |
| Pin DMs to top | PinDMs |
| One-click read-all notifications | ReadAllNotificationsButton |
| Add current channel to forward popup | SelfForward |
| Text replacement / autocorrect | TextReplace |
| Theming data attributes | ThemeAttributes |
| Bundled community theme library | ThemeLibrary |
| Re-add web-only keybinds | WebKeybinds |
| Fix screenshare | WebScreenShareFix |

### Custom plugins (we build)

1. **TournamentMode** — toggle button + global hotkey. **Performance-only, always-on-friendly.** When on: lowers Discord's process priority to BELOW_NORMAL (game gets CPU scheduling), caps renderer at 30 fps (halves compositor GPU load), terminates the arRPC Rich Presence worker, and pauses real-cost CSS animations (animated emoji decoding loop, animated avatars, typing-dots, voice-activity ring). Does NOT strip cosmetic stuff (transitions, badges, hover effects) — those don't add lag, so they stay on. v3 — 2026-05-06.

2. **CompactView** — hotkey-toggle hide of server list, channels, and member list. Auto-hide-on-screenshare option. Targets vertical-monitor screenshare users. ~120 LoC, 0.5 day.

3. **MassDelete** — opt-in only. Settings toggle behind red ban-risk warning. Right-click DM/channel → "Delete my last N messages". Hard 1 msg/sec rate limit, 100 cap per invocation. Local audit log. ~400 LoC, 2 days.

4. **GifFavDefault** — GIF picker opens Favorites tab instead of Trending. Webpack patch on picker mount. ~50 LoC, 2 hours.

5. **GifFavSearch** — search bar above the favorites grid. ~150 LoC, 4 hours.

6. **DiscordmaxxerBranding** — replaces login splash, settings tab, about page with our wordmark + version. ~100 LoC, 0.5 day.

7. **DiscordmaxxerBadge** — viral identity layer with **four channels**:

   - **A. Profile badge (default-on, mod-users-only):** small DM-logo in user popouts + member list, visible only to other Discordmaxxer users. Vencord-style fetch from `users.json` on GitHub Pages. Two flags per user: `is_user`, `is_supporter`.
   - **B. Custom status (opt-in, vanilla-visible):** default-checked in onboarding. Sets `Using Discordmaxxer 🐍 dm.gg`. PATCHed once via Discord's user settings API. Never re-asserted.
   - **C. Bio append (opt-in, vanilla-visible):** appends `— Using Discordmaxxer (dm.gg)` to existing bio. Never overwrites.
   - **D. Pronouns tag (opt-in, vanilla-visible):** sets `🐍 dm.gg` if pronouns currently empty.
   - **Onboarding modal** on first launch presents all four with checkboxes.
   - **Supporter unlock:** non-supporters see the prompt at every major version update; supporters never. Settings panel allows per-channel disable.
   - **Anti-self-bot rules:** all writes happen ONCE on user-clicked consent; never re-asserted; we don't fight users who change values back via Discord normally.
   - ~600 LoC plugin + ~80 LoC server-side cron job. 3 days.

### Shell-level changes (Vesktop fork)

- Rename binary, package, app id, deep-link scheme — DONE in package.json.
- Replace icons (16/32/48/64/128/256/512 + .ico + .icns).
- Custom installer NSIS template.
- Auto-updater pointed at GitHub Releases.
- Telemetry-strip pass.
- Bundle trim: prune dev tools, source maps, unused locales.

## Phased delivery

| Phase | Scope | Days |
|---|---|---|
| **P0** | Bootstrap: fork Vesktop, rename, build & run | 2 |
| **P1** | Defaults config: enable all Vencord plugins, ship 3 themes | 1 |
| **P2** | Custom plugins: Tournament, CompactView, GifFavDefault/Search, Branding, Badge (4 channels) | 6.5 |
| **P3** | MassDelete (gated, rate-limited, warned) | 2 |
| **P4** | Installer + branding: icons, splash, NSIS, code-signing setup | 2 |
| **P5** | First release: GitHub release, daily-driver test | 1 |

**Total: ~14.5 working days for v0.1.** Mac/Linux defer to v0.2.

## Hard rules

1. **Never re-assert account settings** (custom status, bio, pronouns). One-time on consent only. This is the bright line between "third-party tool" and "self-bot."
2. **GPL-3.0 attribution preserved.** NOTICE.md cites Vesktop and Vencord; LICENSE file unchanged.
3. **MassDelete is opt-in only.** Disabled by default, gated behind warning, capped at 100/run with 1 msg/sec rate limit.
4. **No "fake Nitro real perks"** — server-enforced features (boosts, real upload limits, real HD streaming) cannot be unlocked. Don't claim otherwise.
5. **No read receipts.** Discord doesn't expose them; any tool that claims to is lying.
6. **No closed-source.** GPL-3 means source on GitHub from day 1.

## Verification (v0.1 release gate)

End-to-end on Diggy's daily Windows machine:
1. Build installer, install, sign in
2. Voice call (verify WebRTC)
3. Send fake-Nitro animated emoji to non-modded friend → fallback link
4. Toggle TournamentMode → animations gone, FPS throttled
5. MassDelete a test channel's last 10 messages → rate-limit visible
6. Theme switch → 3 bundled themes apply cleanly
7. CompactView hotkey → server list, channels, members each toggle independently
8. DiscordmaxxerBadge → install on a 2nd test account, verify badge appears in user popouts on both; toggle "Hide" works for supporter, gates non-supporter; opt-in custom status sets correctly and is editable in Discord normally
9. Restart → defaults persist
10. Compare RAM idle vs official Discord (target: ≥30% reduction) → real number for landing page

Pass = ship to private beta of ~3 trusted testers before public release.
