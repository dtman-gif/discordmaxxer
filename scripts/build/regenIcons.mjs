/*
 * Discordmaxxer — icon regeneration
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Rasterizes the icon source(s) and packs them into build/icon.ico (Windows)
 * and the static/tray PNGs. .icns (macOS) deferred to v0.2.
 *
 * Sources (in priority order — first found wins):
 *   Main mark (used for .ico):        build/icon-source.png  →  build/icon.svg
 *   Tray mark (used for tray PNGs):   build/tray-source.png  →  main source
 *
 * The split lets the tray use a simplified silhouette that stays legible
 * at 16x16, while the main icon keeps full detail.
 *
 * Usage:
 *   pnpm add -D sharp png-to-ico
 *   pnpm regen-icons
 */

import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const ICON_PNG = resolve(ROOT, "build", "icon-source.png");
const TRAY_SRC_PNG = resolve(ROOT, "build", "tray-source.png");
const SVG = resolve(ROOT, "build", "icon.svg");
const ICO = resolve(ROOT, "build", "icon.ico");
const TRAY_PNG = resolve(ROOT, "static", "tray", "tray.png");
const TRAY_UNREAD_PNG = resolve(ROOT, "static", "tray", "trayUnread.png");
const TASKBAR_PNG = resolve(ROOT, "static", "taskbar", "taskbar.png");

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

async function exists(p) {
    try { await access(p); return true; } catch { return false; }
}

async function loadSource(...candidates) {
    for (const p of candidates) {
        if (await exists(p)) {
            const buf = await readFile(p);
            const isSvg = p.toLowerCase().endsWith(".svg");
            return { path: p, buf, isSvg };
        }
    }
    throw new Error(`[regenIcons] no source found. Tried: ${candidates.join(", ")}`);
}

function makeSharp(src, density = 384) {
    return src.isSvg ? sharp(src.buf, { density }) : sharp(src.buf);
}

const mainSrc = await loadSource(ICON_PNG, SVG);
console.log(`[regenIcons] main source: ${mainSrc.path} (${mainSrc.buf.length} bytes)`);

const traySrc = await loadSource(TRAY_SRC_PNG, ICON_PNG, SVG);
console.log(`[regenIcons] tray source: ${traySrc.path} (${traySrc.buf.length} bytes)`);

const pngBuffers = [];
for (const size of ICO_SIZES) {
    const png = await makeSharp(mainSrc, 384)
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
// require monochrome alpha-only PNGs.)
const trayPng = await makeSharp(traySrc, 512)
    .resize(32, 32)
    .png()
    .toBuffer();
await writeFile(TRAY_PNG, trayPng);
console.log(`[regenIcons] wrote ${TRAY_PNG} (${trayPng.length} bytes)`);

// trayUnread: same silhouette with a 1px red border so users can distinguish
// "you have notifications" from "tray idle" at a glance.
const trayUnreadPng = await makeSharp(traySrc, 512)
    .resize(30, 30)
    .extend({ top: 1, bottom: 1, left: 1, right: 1, background: { r: 255, g: 80, b: 80, alpha: 1 } })
    .png()
    .toBuffer();
await writeFile(TRAY_UNREAD_PNG, trayUnreadPng);
console.log(`[regenIcons] wrote ${TRAY_UNREAD_PNG} (${trayUnreadPng.length} bytes)`);

// Taskbar runtime override icon (Win32 BrowserWindow.setIcon). 256x256 from
// the no-bullet-holes tray-source so the taskbar/Alt-Tab thumbnail doesn't
// show bullet-hole noise. The shortcut/exe icon (build/icon.ico) keeps the
// bullet-holes form via the main source. See src/main/mainWindow.ts.
const taskbarPng = await makeSharp(traySrc, 512)
    .resize(256, 256)
    .png()
    .toBuffer();
await writeFile(TASKBAR_PNG, taskbarPng);
console.log(`[regenIcons] wrote ${TASKBAR_PNG} (${taskbarPng.length} bytes)`);

console.log("\n.icns + trayTemplate.png generation deferred to v0.2 (Mac target). For Mac:");
console.log("  - install iconutil or use https://github.com/idesis-gmbh/png2icons");
console.log("  - run an .icns step here that emits build/icon.icns");
