/*
 * Discordmaxxer — themed sound pack generator
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * One-shot generator: reads selected Kenney CC-BY 4.0 .ogg files from
 * branding/sounds-candidates/kenney/Audio/ and emits a TS module of
 * base64-encoded data URLs, one set per theme. The runtime in
 * plugins/_dm-shared/sounds.ts looks up `THEMED_PACKS[themeId]?.[soundName]`
 * before falling through to the universal Material Design clips and finally
 * to the Web Audio synth fallback.
 *
 * Run via: pnpm tsx overlay-scripts/gen-themed-sounds.mjs
 * (Or once: node overlay-scripts/gen-themed-sounds.mjs)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

const KENNEY_DIR = join(PROJECT_ROOT, "branding", "sounds-candidates", "kenney", "Audio");
const OUT_PATH = join(PROJECT_ROOT, "plugins", "_dm-shared", "themed-sound-packs.ts");

// Curated by theme vibe — see each line for rationale.
// click   = light tap  (button press, settings click)
// toggle  = state flip (panel open/close)
// notify  = nice hit   (mention chime fallback)
// error   = bad result (rejected action)
const PACKS = {
    maxxer: {
        // Default neutral vibrant. Generic Material-leaning.
        click:  "click_001.ogg",
        toggle: "select_001.ogg",
        notify: "confirmation_001.ogg",
        error:  "error_001.ogg"
    },
    val: {
        // Tactical (Valorant): sharp, sniper-like.
        click:  "click_004.ogg",
        toggle: "switch_001.ogg",
        notify: "confirmation_003.ogg",
        error:  "error_003.ogg"
    },
    sonic: {
        // Kinetic (Sonic): bright, rising glass.
        click:  "maximize_001.ogg",
        toggle: "switch_002.ogg",
        notify: "glass_002.ogg",
        error:  "error_002.ogg"
    },
    dmc: {
        // Gothic (DMC): deep tones, glass shatter.
        click:  "bong_001.ogg",
        toggle: "drop_001.ogg",
        notify: "glass_006.ogg",
        error:  "error_005.ogg"
    },
    bo3: {
        // Military (BO3): dry, percussive, glitchy.
        click:  "click_005.ogg",
        toggle: "glitch_002.ogg",
        notify: "confirmation_002.ogg",
        error:  "error_006.ogg"
    },
    akatsuki: {
        // Bone + blood + void. Ominous strings + temple bells + glass shards.
        click:  "pluck_001.ogg",       // string pluck
        toggle: "scroll_001.ogg",      // ritual paper unfurl
        notify: "bong_001.ogg",        // temple bell — Akatsuki summon
        error:  "scratch_002.ogg"      // ritual scratch
    },
    dmcdt: {
        // DMC: Devil Trigger — Sparda blue + Dante red. Aggressive percussion.
        click:  "switch_004.ogg",      // sword-snap
        toggle: "open_002.ogg",        // demonic gate open
        notify: "maximize_004.ogg",    // ascending DT activation
        error:  "drop_003.ogg"         // weapon drop
    },
    eminence: {
        // Eminence in Shadow — atomic blue lightning + slime magenta.
        click:  "switch_005.ogg",      // crisp lightning crackle
        toggle: "open_003.ogg",        // shadow-stage curtain
        notify: "maximize_007.ogg",    // electric ascending pulse
        error:  "glitch_004.ogg"       // glitch (theatrical break)
    }
};

function toDataUrl(ogg) {
    const buf = readFileSync(join(KENNEY_DIR, ogg));
    return "data:audio/ogg;base64," + buf.toString("base64");
}

const lines = [];
lines.push("/*");
lines.push(" * Discordmaxxer — themed sound packs (auto-generated)");
lines.push(" * Copyright (c) 2026 Diggy + Kenney (CC-BY 4.0 audio)");
lines.push(" * SPDX-License-Identifier: GPL-3.0-or-later AND CC-BY-4.0");
lines.push(" *");
lines.push(" * DO NOT EDIT BY HAND — regenerate via:");
lines.push(" *   node overlay-scripts/gen-themed-sounds.mjs");
lines.push(" *");
lines.push(" * Source assets: kenney.nl game audio (CC-BY 4.0). Each theme has");
lines.push(" * a curated 4-sound pack (click/toggle/notify/error) chosen by vibe.");
lines.push(" */");
lines.push("");
lines.push("import type { ThemeId } from \"./themes\";");
lines.push("");
lines.push("type SoundName = \"click\" | \"toggle\" | \"notify\" | \"error\";");
lines.push("");
lines.push("export const THEMED_SOUND_PACKS: Partial<Record<ThemeId, Record<SoundName, string>>> = {");

let totalBytes = 0;
for (const [theme, mapping] of Object.entries(PACKS)) {
    lines.push(`    ${theme}: {`);
    for (const [name, file] of Object.entries(mapping)) {
        const url = toDataUrl(file);
        totalBytes += url.length;
        lines.push(`        ${name}: ${JSON.stringify(url)},`);
    }
    lines.push("    },");
}
lines.push("};");
lines.push("");

writeFileSync(OUT_PATH, lines.join("\n"));
console.log(`[gen-themed-sounds] wrote ${OUT_PATH}`);
console.log(`[gen-themed-sounds] ${Object.keys(PACKS).length} themes, ${Object.keys(PACKS.maxxer).length} sounds each, ~${Math.round(totalBytes / 1024)} KB total`);
