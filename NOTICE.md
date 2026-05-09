# Discordmaxxer — Upstream Attribution

Discordmaxxer is a fork of [Vesktop](https://github.com/Vencord/Vesktop) by Vendicated and the Vencord team.

## Licenses

- **Discordmaxxer** is licensed under GPL-3.0-or-later. See [LICENSE](LICENSE).
- **Vesktop** (upstream) is GPL-3.0-or-later. The unchanged LICENSE file in this repo IS Vesktop's original license file.

## Credits

- **Vesktop** (https://github.com/Vencord/Vesktop) — Vendicated and contributors. The Electron shell, screenshare-with-audio (venmic), tray, updater, Discord-domain CSP rewriting, and the bundled Vencord pipeline are all from upstream.
- **Vencord** (https://github.com/Vendicated/Vencord) — Vendicated and contributors. Most of the user-facing features in Discordmaxxer are Vencord plugins enabled by default. Vencord ships ~169 plugins under GPL-3.0-or-later.
- **arrpc** (https://github.com/OpenAsar/arrpc) — OpenAsar. Used for Discord RPC support on platforms where official Discord isn't installed.
- **Material Design Sound Resources** (https://m2.material.io/design/sound/sound-resources.html) — Google. Four UI sounds (click, toggle, notify, error) bundled in `plugins/_dm-shared/sounds-pack.ts` are derived from the Material Design product sounds set. Licensed under CC-BY 4.0 (https://creativecommons.org/licenses/by/4.0/).

## Modifications (Discordmaxxer overlay)

The following are original to Discordmaxxer and added on top of the Vesktop fork:

- `plugins/` — custom Vencord plugins (TournamentMode, CompactView, MassDelete, GifFavDefault, GifFavSearch, DiscordmaxxerBranding, DiscordmaxxerBadge)
- `themes/` — bundled default themes
- `branding/` — icon, splash, wordmark assets
- `overlay-scripts/` — build-time merger for our plugins into the Vencord pipeline
- `README.md`, `CLAUDE.md`, `RESUME.md` — replaced
- `package.json` — renamed (name, appId, productName, executableName, Linux desktop entry); upstream package metadata otherwise preserved

## Compliance

This is a non-trivial fork. Per GPL-3.0 §5, modified versions must:
- Carry prominent notices stating they were modified ✓ (this file)
- Be released under GPL-3.0-or-later ✓
- Carry the GPL-3.0 license text ✓ (LICENSE unchanged)

All upstream copyright headers in source files are preserved unchanged. Files originating in this fork carry their own headers.
