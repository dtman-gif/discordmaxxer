/*
 * Discordmaxxer — Vencord source-rebrand pipeline
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Applies text-level patches to vencord-src/ before the Vencord build runs.
 * Used to strip Vencord branding from user-visible UI surfaces (settings tab
 * title, donation prompt, etc.) and replace them with Discordmaxxer-branded
 * content.
 *
 * Idempotent: each patch checks if the target text is already present and
 * skips. If `find` is missing AND `replace` is present, we count it as
 * already-patched. If neither, we warn (upstream Vencord changed shape).
 *
 * GPL-3 attribution: per-file copyright headers + LICENSE + NOTICE.md remain
 * intact. We only patch user-visible UI strings, never copyright notices.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENCORD_SRC = resolve(__dirname, "..", "vencord-src");

const PATCHES = [
    // ── A. Settings tab title ──────────────────────────────────────────
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'wrapTab(VencordSettings, "Vencord Settings")',
        replace: 'wrapTab(VencordSettings, "Discordmaxxer")'
    },

    // ── B. Donation card → VIP benefits ────────────────────────────────
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'title="Support the Project"',
        replace: 'title="Get more out of Discordmaxxer"'
    },
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'description="Please consider supporting the development of Vencord by donating!"',
        replace: 'description="Unlock VIP themes, video backgrounds, and tier-locked plugins. Visit discordmaxxer.dev/vip for the full ladder."'
    },
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'subtitle="Thank you for donating!"',
        replace: 'subtitle="Thank you for going VIP."'
    },
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'description="You can manage your perks at any time by messaging @vending.machine."',
        replace: 'description="Your perks are unlocked automatically. Reach support via the Discordmaxxer Discord."'
    },
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: "description=\"Since you've contributed to Vencord you now have a cool new badge!\"",
        replace: 'description="Thanks for contributing! Your contributor badge is active across Discordmaxxer."'
    },

    // ── C. DonateButton: URL + label ───────────────────────────────────
    {
        file: "src/components/settings/DonateButton.tsx",
        find: 'https://github.com/sponsors/Vendicated',
        replace: 'https://discordmaxxer.dev/vip'
    },
    {
        file: "src/components/settings/DonateButton.tsx",
        find: '            Donate\n',
        replace: '            View VIP\n'
    },
    {
        file: "src/components/settings/DonateButton.tsx",
        find: 'className="vc-donate-button"',
        replace: 'className="dm-vip-button"'
    },

    // ── D. Tab nav rename: "Vencord" entries → Discordmaxxer-flavored ──
    // The plugins/themes tabs are named neutrally, but the SettingsRouter
    // shows a header. Patch if needed.
];

let patched = 0;
let skipped = 0;
const warnings = [];

for (const p of PATCHES) {
    const path = join(VENCORD_SRC, p.file);
    if (!existsSync(path)) {
        warnings.push(`File not found: ${p.file}`);
        continue;
    }
    let content = readFileSync(path, "utf-8");

    if (content.includes(p.replace) && !content.includes(p.find)) {
        skipped++;
        continue;
    }

    if (!content.includes(p.find)) {
        warnings.push(`Patch target not found in ${p.file}: "${p.find.slice(0, 60)}..."`);
        continue;
    }

    content = content.split(p.find).join(p.replace);
    writeFileSync(path, content);
    patched++;
    console.log(`[rebrand] ✓ ${p.file}: "${p.find.slice(0, 50)}..." → "${p.replace.slice(0, 50)}..."`);
}

console.log(`\n[rebrand] applied=${patched} skipped(idempotent)=${skipped} warnings=${warnings.length}`);
for (const w of warnings) console.warn(`[rebrand] ⚠ ${w}`);
