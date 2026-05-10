/*
 * Discordmaxxer — chime library generator
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * One-shot generator: reads 20+ curated Kenney CC-BY 4.0 .ogg files from
 * branding/sounds-candidates/kenney/Audio/ and emits a TS module of base64
 * data URLs with friendly names. DiscordmaxxerChime's settings expose
 * these as a SELECT — MAXXER+ subscribers pick whichever chime they want
 * for @-mentions / DMs / @everyone.
 *
 * Run via: node overlay-scripts/gen-chime-library.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

const KENNEY_DIR = join(PROJECT_ROOT, "branding", "sounds-candidates", "kenney", "Audio");
const OUT_PATH = join(PROJECT_ROOT, "plugins", "_dm-shared", "chime-library.ts");

// 20 curated chimes spanning soft → bright → dramatic → glitchy. Names
// are user-facing labels; ids are stable slugs (used as localStorage keys).
const CHIMES = [
    // Soft / minimal
    { id: "pluck-string",        label: "String pluck",          file: "pluck_001.ogg" },
    { id: "wine-glass",          label: "Wine glass tap",        file: "glass_002.ogg" },
    { id: "wood-tick",           label: "Wood tick",             file: "tick_001.ogg" },
    { id: "soft-select",         label: "Soft select",           file: "select_001.ogg" },
    { id: "ui-tick",             label: "UI tick",               file: "tick_002.ogg" },
    // Mid / classic notification
    { id: "confirm",             label: "Confirm bell",          file: "confirmation_001.ogg" },
    { id: "tactical-confirm",    label: "Tactical confirm",      file: "confirmation_003.ogg" },
    { id: "discord-soft",        label: "Soft chime",            file: "switch_001.ogg" },
    { id: "rising-chime",        label: "Rising chime",          file: "maximize_001.ogg" },
    { id: "power-up",            label: "Power-up",              file: "maximize_004.ogg" },
    { id: "electric-pulse",      label: "Electric pulse",        file: "maximize_007.ogg" },
    // Bright / kinetic
    { id: "sword-snap",          label: "Sword snap",            file: "switch_004.ogg" },
    { id: "lightning-crack",     label: "Lightning crack",       file: "switch_005.ogg" },
    { id: "toggle-click",        label: "Toggle click",          file: "toggle_003.ogg" },
    // Dramatic
    { id: "temple-bell",         label: "Temple bell",           file: "bong_001.ogg" },
    { id: "glass-break",         label: "Glass break",           file: "glass_006.ogg" },
    { id: "gate-open",           label: "Gate open",             file: "open_002.ogg" },
    { id: "curtain-rise",        label: "Curtain rise",          file: "open_003.ogg" },
    // Dirty / glitchy
    { id: "static-burst",        label: "Static burst",          file: "glitch_001.ogg" },
    { id: "scratch",             label: "Vinyl scratch",         file: "scratch_002.ogg" },
    { id: "glitch-beep",         label: "Glitch beep",           file: "glitch_002.ogg" },
];

function toDataUrl(file) {
    const buf = readFileSync(join(KENNEY_DIR, file));
    return "data:audio/ogg;base64," + buf.toString("base64");
}

const lines = [];
lines.push("/*");
lines.push(" * Discordmaxxer — chime library (auto-generated)");
lines.push(" * Copyright (c) 2026 Diggy + Kenney (CC-BY 4.0 audio)");
lines.push(" * SPDX-License-Identifier: GPL-3.0-or-later AND CC-BY-4.0");
lines.push(" *");
lines.push(" * DO NOT EDIT BY HAND — regenerate via:");
lines.push(" *   node overlay-scripts/gen-chime-library.mjs");
lines.push(" *");
lines.push(" * 21 curated mention chimes spanning soft → bright → dramatic → glitchy.");
lines.push(" * DiscordmaxxerChime exposes these as a SELECT in plugin settings.");
lines.push(" */");
lines.push("");
lines.push("export interface Chime {");
lines.push("    id: string;");
lines.push("    label: string;");
lines.push("    url: string;");
lines.push("}");
lines.push("");
lines.push("export const CHIME_LIBRARY: Chime[] = [");

let totalBytes = 0;
for (const c of CHIMES) {
    const url = toDataUrl(c.file);
    totalBytes += url.length;
    lines.push(`    { id: ${JSON.stringify(c.id)}, label: ${JSON.stringify(c.label)}, url: ${JSON.stringify(url)} },`);
}
lines.push("];");
lines.push("");
lines.push("export const CHIME_BY_ID: Record<string, Chime> = Object.fromEntries(");
lines.push("    CHIME_LIBRARY.map(c => [c.id, c])");
lines.push(");");
lines.push("");

writeFileSync(OUT_PATH, lines.join("\n"));
console.log(`[gen-chime-library] wrote ${OUT_PATH}`);
console.log(`[gen-chime-library] ${CHIMES.length} chimes, ~${Math.round(totalBytes / 1024)} KB total`);
