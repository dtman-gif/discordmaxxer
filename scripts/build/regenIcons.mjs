/*
 * Discordmaxxer — icon regeneration
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Rasterizes build/icon.svg to multi-size PNGs and packs them into
 * build/icon.ico (Windows) and build/icon.icns (macOS, deferred to v0.2).
 *
 * Why this exists: build/icon.svg was rebranded 2026-05-05 with the
 * Discordmaxxer magenta+blue gradient mark, but icon.ico + icon.icns are
 * still Vesktop's. electron-builder uses the .ico/.icns directly — the
 * .svg is only metadata on Linux. Until this script runs and overwrites
 * them, the installer + tray icon + .exe icon will be Vesktop's penguin.
 *
 * Usage:
 *   pnpm add -D sharp png-to-ico
 *   node scripts/build/regenIcons.mjs
 *
 * Both deps are pure-JS-with-prebuilt-binary (sharp ships native bins
 * for win/mac/linux). Add to devDependencies before running.
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const SVG = resolve(ROOT, "build", "icon.svg");
const ICO = resolve(ROOT, "build", "icon.ico");
const TRAY_PNG = resolve(ROOT, "static", "tray", "tray.png");
const TRAY_UNREAD_PNG = resolve(ROOT, "static", "tray", "trayUnread.png");

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

let sharp, pngToIco;
try {
    sharp = (await import("sharp")).default;
    pngToIco = (await import("png-to-ico")).default;
} catch (e) {
    console.error("[regenIcons] missing deps:", e.message);
    console.error("Install with: pnpm add -D sharp png-to-ico");
    process.exit(1);
}

const svgBuf = await readFile(SVG);
console.log(`[regenIcons] source: ${SVG} (${svgBuf.length} bytes)`);

const pngBuffers = [];
for (const size of ICO_SIZES) {
    const png = await sharp(svgBuf, { density: 384 })
        .resize(size, size)
        .png()
        .toBuffer();
    pngBuffers.push(png);
    console.log(`  rasterized ${size}x${size} (${png.length} bytes)`);
}

const ico = await pngToIco(pngBuffers);
await writeFile(ICO, ico);
console.log(`[regenIcons] wrote ${ICO} (${ico.length} bytes)`);

// Tray PNGs — Windows + Linux read these directly. (macOS reads
// trayTemplate.png separately; deferred to v0.2 since template icons
// require monochrome SVGs that the bolt mark isn't yet.)
const trayPng = await sharp(svgBuf, { density: 512 })
    .resize(32, 32)
    .png()
    .toBuffer();
await writeFile(TRAY_PNG, trayPng);
console.log(`[regenIcons] wrote ${TRAY_PNG} (${trayPng.length} bytes)`);

// trayUnread: same bolt with a 1px red border so users can distinguish
// "you have notifications" from "tray idle" at a glance.
const trayUnreadPng = await sharp(svgBuf, { density: 512 })
    .resize(30, 30)
    .extend({ top: 1, bottom: 1, left: 1, right: 1, background: { r: 255, g: 80, b: 80, alpha: 1 } })
    .png()
    .toBuffer();
await writeFile(TRAY_UNREAD_PNG, trayUnreadPng);
console.log(`[regenIcons] wrote ${TRAY_UNREAD_PNG} (${trayUnreadPng.length} bytes)`);

console.log("\n.icns + trayTemplate.png generation deferred to v0.2 (Mac target). For Mac:");
console.log("  - install iconutil or use https://github.com/idesis-gmbh/png2icons");
console.log("  - run an .icns step here that emits build/icon.icns");
