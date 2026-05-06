/*
 * Discordmaxxer — Vencord overlay builder
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Mirrors `plugins/` into vencord-src/src/userplugins/, builds Vencord from
 * source, then stages the 4 dist files Vesktop expects into `vencord-dist/`.
 * Run via `pnpm overlay:vencord`.
 */

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import "./rebrand-vencord.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

const PLUGINS_SRC = join(PROJECT_ROOT, "plugins");
const VENCORD_SRC = join(PROJECT_ROOT, "vencord-src");
const VENCORD_USERPLUGINS = join(VENCORD_SRC, "src", "userplugins");
const VENCORD_BUILT_DIST = join(VENCORD_SRC, "dist");
const STAGED_DIST = join(PROJECT_ROOT, "vencord-dist");

const FILES_TO_STAGE = [
    "vencordDesktopMain.js",
    "vencordDesktopPreload.js",
    "vencordDesktopRenderer.js",
    "vencordDesktopRenderer.css"
];

function log(msg) {
    console.log(`[overlay] ${msg}`);
}

function syncUserplugins() {
    // Wipe + recreate userplugins to guarantee deletes propagate
    if (existsSync(VENCORD_USERPLUGINS)) {
        rmSync(VENCORD_USERPLUGINS, { recursive: true, force: true });
    }
    mkdirSync(VENCORD_USERPLUGINS, { recursive: true });

    if (!existsSync(PLUGINS_SRC)) {
        log("No plugins/ folder found — building stock Vencord (no custom plugins)");
        return 0;
    }

    const entries = readdirSync(PLUGINS_SRC);
    let copied = 0;
    for (const name of entries) {
        const src = join(PLUGINS_SRC, name);
        if (!statSync(src).isDirectory()) continue;
        const dest = join(VENCORD_USERPLUGINS, name);
        cpSync(src, dest, { recursive: true });
        copied++;
        log(`  ✓ ${name}`);
    }
    return copied;
}

function buildVencord() {
    log("Running Vencord build (pnpm build inside vencord-src/)...");
    execSync("pnpm build", { cwd: VENCORD_SRC, stdio: "inherit" });
}

function stageDist() {
    if (!existsSync(VENCORD_BUILT_DIST)) {
        throw new Error(`Vencord build did not produce ${VENCORD_BUILT_DIST}`);
    }

    if (existsSync(STAGED_DIST)) {
        rmSync(STAGED_DIST, { recursive: true, force: true });
    }
    mkdirSync(STAGED_DIST, { recursive: true });

    for (const filename of FILES_TO_STAGE) {
        const src = join(VENCORD_BUILT_DIST, filename);
        const dest = join(STAGED_DIST, filename);
        if (!existsSync(src)) {
            throw new Error(`Expected Vencord output missing: ${filename}`);
        }
        cpSync(src, dest);
    }

    // Vesktop's vencordLoader expects a package.json alongside the JS files
    writeFileSync(join(STAGED_DIST, "package.json"), JSON.stringify({ name: "vencord-discordmaxxer" }, null, 2));

    log(`Staged ${FILES_TO_STAGE.length + 1} files at ${STAGED_DIST}`);
}

function main() {
    log("=== Discordmaxxer overlay build ===");
    const t0 = Date.now();

    if (!existsSync(VENCORD_SRC)) {
        console.error(`vencord-src/ not found. Run: git clone https://github.com/Vendicated/Vencord.git ${VENCORD_SRC}`);
        process.exit(1);
    }

    const copied = syncUserplugins();
    log(`Synced ${copied} custom plugin(s) into vencord-src/src/userplugins/`);

    buildVencord();
    stageDist();

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`✅ Done in ${elapsed}s. Pointing Discordmaxxer at ${STAGED_DIST}`);
    log(`   Set State.store.vencordDir to this path on next launch (handled in main/index.ts).`);
}

main();
