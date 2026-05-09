<p align="center">
  <img src="branding/discordmaxxer-mark-secondary.png" alt="Discordmaxxer" width="200"/>
</p>

# Discordmaxxer

> Discord, optimized.

A standalone Discord client with 30+ client-side enhancements pre-enabled, custom branding, and original plugins for tournament low-latency mode, mass-delete with safeguards, and GIF picker upgrades.

7th project in the [maxxer suite](../).

**Status:** v0.1 — in development (P0 bootstrap complete).

---

## What it is

A standalone Discord-optimized client built on a forked plugin engine. Single download, no official Discord install needed. Ships with sensible defaults, original plugins, and a clean rebrand. Upstream credits in [NOTICE.md](NOTICE.md) per GPL-3.

## Headline features

- **30+ third-party plugins enabled by default** — FakeNitro, MessageLogger (see deleted), ClearURLs, ClientTheme, FriendsSince, ImageZoom, TypingTweaks, RelationshipNotifier, SilentTyping, GifPaste, VolumeBooster, BetterFolders, BetterSettings, MentionAvatars, PinDMs, ReadAllNotificationsButton, TextReplace, ThemeLibrary, WebKeybinds, WebScreenShareFix, and more.
- **TournamentMode** (custom) — global hotkey kills animations, RPC, badge polling, and voice noise-suppression for low-input-delay competitive sessions.
- **CompactView** (custom) — hotkey to hide server list, channels, and member sidebar. Optional auto-hide on screenshare. For vertical-monitor users.
- **MassDelete** (custom, opt-in) — bulk-delete your own messages with rate-limiting and ban-risk warnings.
- **GIF picker upgrades** (custom) — opens favorites by default, search bar over favorites.
- **DiscordmaxxerBadge** (custom) — viral identity layer with supporter-unlock removal.
- **~30% less RAM** than official Discord (telemetry stripped, bundle trimmed).

## Building from source

Requires Git, Node.js ≥ 18, pnpm ≥ 8.

```powershell
pnpm install
pnpm build
pnpm start          # launches the app
pnpm package        # produces installers in dist/
```

## License + attribution

GPL-3.0-or-later. Forked from upstream GPL-3 projects. See [NOTICE.md](NOTICE.md) for full credits + commit lineage.

## Risk disclaimer

Client-modding Discord violates Discord's ToS. Enforcement is rare for personal use of plugin-based clients (similar tools have shipped to hundreds of thousands of users without mass-ban events). MassDelete carries higher risk — gated, rate-limited, opt-in for that reason. Use at your own discretion.
