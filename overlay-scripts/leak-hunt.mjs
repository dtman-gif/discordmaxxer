/*
 * Discordmaxxer — Vencord/Vesktop string leak hunter
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Connects to running Discordmaxxer (CDP @ :9222), opens Discord User Settings,
 * walks every visible settings tab (User + Discordmaxxer/Vencord), grabs the
 * rendered DOM text of each, and reports any occurrences of "Vencord" or
 * "Vesktop" so we can patch them.
 *
 * Outputs:
 *   overlay-scripts/screenshots/leak-<ts>-<tab>.png  (screenshot per tab)
 *   overlay-scripts/reports/leak-<ts>.json           (full report)
 *   stdout: per-tab leak summary
 */

import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = resolve(__dirname, "screenshots");
const REPORTS_DIR = resolve(__dirname, "reports");
const RUN_TS = Date.now();
const DEBUG_URL = "http://localhost:9222";
mkdirSync(SCREENSHOTS_DIR, { recursive: true });
mkdirSync(REPORTS_DIR, { recursive: true });

const log = (...a) => console.log("[leak]", ...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeName = s => s.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 40);

async function connect() {
    const browser = await puppeteer.connect({ browserURL: DEBUG_URL, defaultViewport: null });
    const pages = await browser.pages();
    const discord = pages.find(p => p.url().includes("discord.com")) ?? pages[0];
    if (!discord) throw new Error("No Discord page found");
    return { browser, page: discord };
}

async function waitFor(page, timeoutMs, fn) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            if (await page.evaluate(fn)) return true;
        } catch (e) {
            // Navigation destroys execution context; just retry next tick.
            if (!/Execution context|destroyed|frame got detached/i.test(String(e.message))) throw e;
        }
        await sleep(500);
    }
    return false;
}

async function shot(page, label) {
    const path = join(SCREENSHOTS_DIR, `leak-${RUN_TS}-${safeName(label)}.png`);
    try { await page.screenshot({ path, type: "png" }); } catch (e) { log("screenshot failed:", label, e.message); }
    return path;
}

async function openSettings(page) {
    log("opening User Settings via SettingsRouter.openUserSettings …");
    const result = await page.evaluate(() => {
        const C = globalThis.Vencord?.Webpack?.Common ?? {};
        const tried = [];
        const r = C.SettingsRouter;
        if (r) {
            tried.push("router_present");
            if (typeof r.openUserSettings === "function") {
                try { r.openUserSettings("my_account_panel"); return { via: "openUserSettings", tried }; } catch (e) { tried.push("openUserSettings_threw:" + e.message); }
            }
            if (typeof r.open === "function") {
                try { r.open("My Account"); return { via: "open", tried }; } catch (e) { tried.push("open_threw:" + e.message); }
            }
        }
        // Last-resort webpack hunt for any module exposing openUserSettings.
        try {
            const wp = globalThis.Vencord?.Webpack;
            const f = wp?.findByProps?.("openUserSettings");
            if (f) { f.openUserSettings("my_account_panel"); return { via: "findByProps", tried }; }
        } catch (e) { tried.push("findByProps_threw:" + e.message); }
        return { via: null, tried, dump: Object.keys(C) };
    });
    log("open result:", JSON.stringify(result).slice(0, 400));
    if (!result.via) throw new Error("Could not invoke openUserSettings — see dump above");
    const ready = await waitFor(page, 15000, () => {
        const all = document.querySelectorAll('[role="tab"], [role="button"], div, a');
        for (const el of all) {
            const t = (el.textContent ?? "").trim();
            if (t === "Log Out" || t === "My Account") return true;
        }
        return false;
    });
    if (!ready) throw new Error("User Settings modal didn't render after open");
}

async function listTabs(page) {
    return await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[role="listitem"][class*="item_"]'));
        const seen = new Set();
        const tabs = [];
        for (const el of items) {
            const text = (el.textContent ?? "").trim();
            if (!text || seen.has(text)) continue;
            if (text.length > 60) continue;
            seen.add(text);
            tabs.push({ index: tabs.length, label: text, visible: el.offsetParent !== null });
        }
        return tabs;
    });
}

async function clickTabByLabel(page, label) {
    return await page.evaluate(lbl => {
        const items = Array.from(document.querySelectorAll('[role="listitem"][class*="item_"]'));
        const t = items.find(el => (el.textContent ?? "").trim() === lbl);
        if (t) { t.click(); return true; }
        return false;
    }, label);
}

async function scanForLeaks(page) {
    return await page.evaluate(() => {
        // Scope to the User Settings layer if we can find it.
        const layer = document.querySelector('[class*="layer"][class*="baseLayer"]') ||
            document.querySelector('[class*="standardSidebarView"]') ||
            document.querySelector('[role="dialog"]') ||
            document.body;
        const root = layer;
        const text = root.innerText || "";
        const haystack = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
        const findings = { vencord: [], vesktop: [] };
        for (const line of haystack) {
            if (/vencord/i.test(line)) findings.vencord.push(line);
            if (/vesktop/i.test(line)) findings.vesktop.push(line);
        }
        // Also scan attribute values (titles, aria-labels, placeholders).
        for (const el of root.querySelectorAll("*")) {
            for (const attr of ["title", "aria-label", "placeholder", "data-text"]) {
                const v = el.getAttribute?.(attr);
                if (!v) continue;
                if (/vencord/i.test(v) && !findings.vencord.includes(v)) findings.vencord.push(`[${attr}] ${v}`);
                if (/vesktop/i.test(v) && !findings.vesktop.includes(v)) findings.vesktop.push(`[${attr}] ${v}`);
            }
        }
        return { findings, dialogTitle: root.querySelector('h1,h2,h3')?.textContent?.trim() ?? "" };
    });
}

async function main() {
    const { browser, page } = await connect();
    log("connected at", page.url());

    const vReady = await waitFor(page, 60000, () =>
        !!(globalThis.Vencord && Vencord.Plugins && Object.keys(Vencord.Plugins.plugins ?? {}).length > 0));
    if (!vReady) { log("ERROR: Vencord never became ready"); process.exit(1); }
    log("Vencord ready");

    await sleep(1500);
    await openSettings(page);
    await sleep(800);
    await shot(page, "00_settings_open");

    const tabs = await listTabs(page);
    log(`found ${tabs.length} settings tabs`);
    const report = { runTs: RUN_TS, tabs: [], summary: { totalTabs: tabs.length, tabsWithLeaks: 0, totalLeaks: 0 } };

    for (const tab of tabs) {
        log(`→ tab: ${tab.label}`);
        try {
            await clickTabByLabel(page, tab.label);
            await sleep(900);
            const scan = await scanForLeaks(page);
            const path = await shot(page, `tab_${tab.label}`);
            const leakCount = scan.findings.vencord.length + scan.findings.vesktop.length;
            if (leakCount > 0) {
                report.summary.tabsWithLeaks += 1;
                report.summary.totalLeaks += leakCount;
                log(`   LEAKS (${leakCount}): vencord=${scan.findings.vencord.length} vesktop=${scan.findings.vesktop.length}`);
                for (const l of scan.findings.vencord) log("     V:", l.slice(0, 200));
                for (const l of scan.findings.vesktop) log("     S:", l.slice(0, 200));
            } else {
                log("   clean");
            }
            report.tabs.push({ label: tab.label, dialogTitle: scan.dialogTitle, leakCount, findings: scan.findings, screenshot: path });
        } catch (e) {
            log("   ERROR:", e.message);
            report.tabs.push({ label: tab.label, error: e.message });
        }
    }

    // Also scan main DOM (chat-bar context menu coverage requires a right-click — skip in v1).
    const reportPath = join(REPORTS_DIR, `leak-${RUN_TS}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log("");
    log("==== SUMMARY ====");
    log(`Tabs scanned : ${report.summary.totalTabs}`);
    log(`Tabs w/ leaks: ${report.summary.tabsWithLeaks}`);
    log(`Total leaks  : ${report.summary.totalLeaks}`);
    log("Report       :", reportPath);

    await browser.disconnect();
}

main().catch(e => { console.error("[leak] FATAL", e); process.exit(1); });
