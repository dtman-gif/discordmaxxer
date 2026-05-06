/*
 * Discordmaxxer — CPU/RAM bench
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Polls Get-Process for the Discordmaxxer + Discord process trees over a
 * window and dumps a per-process + aggregate CSV to stdout.
 *
 * Usage:
 *   1. Open Discordmaxxer AND stock Discord side-by-side. Don't actively
 *      use either — let them sit idle.
 *   2. Run: node overlay-scripts/bench-cpu.mjs --duration 300 --interval 5
 *      (5 min @ 5 sec ticks = 60 samples per app)
 *   3. CSV output → import into Excel/Sheets, average the CPU% column,
 *      compare totals.
 *
 * Methodology notes:
 *   - Electron apps spawn N child processes (main + renderers + GPU + utility).
 *     We sum across the whole tree so the comparison is apples-to-apples.
 *   - First sample is throwaway (PowerShell needs a baseline for CPU%).
 *   - To stress-test: load a busy server in both clients, then re-bench.
 *
 * Caveats:
 *   - "fewer CPU cycles than stock" is only meaningful at parity workload.
 *     Open the same servers, scroll to the same place, no animations playing
 *     in one and not the other.
 *   - Discord's official client uses background-process throttling that
 *     Electron's foreground does not by default. If Discordmaxxer's window
 *     is focused and Discord's isn't, the comparison is unfair.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, _, i, a) => {
        if (i % 2 === 0 && a[i].startsWith("--")) acc.push([a[i].slice(2), a[i + 1]]);
        return acc;
    }, [])
);
const DURATION_S = Number(args.duration ?? 60);
const INTERVAL_S = Number(args.interval ?? 5);
const OUT = args.out ?? `bench-${Date.now()}.csv`;

// Process-name match patterns. Discord and Discordmaxxer both run multiple
// child processes; we match by the binary name they install as.
const TARGETS = [
    { label: "Discordmaxxer", names: ["discordmaxxer", "Discordmaxxer", "electron"] }, // electron when running pnpm start:dev
    { label: "Discord", names: ["Discord"] }
];

function snapshot() {
    // PowerShell oneliner: Get-Process, return Name, Id, CPU(s), WorkingSet64
    const ps = `Get-Process | Select-Object Id, ProcessName, CPU, @{n='WS_MB';e={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json -Compress`;
    const r = spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) throw new Error("Get-Process failed: " + r.stderr);
    const arr = JSON.parse(r.stdout);
    return Array.isArray(arr) ? arr : [arr];
}

function bucketize(snap, target) {
    const matched = snap.filter(p => target.names.includes(p.ProcessName));
    return matched.reduce(
        (acc, p) => ({ pids: acc.pids.concat(p.Id), cpuTotal: acc.cpuTotal + (p.CPU ?? 0), wsMB: acc.wsMB + (p.WS_MB ?? 0), count: acc.count + 1 }),
        { pids: [], cpuTotal: 0, wsMB: 0, count: 0 }
    );
}

const rows = [];
rows.push("ts_iso,seconds_elapsed," + TARGETS.flatMap(t => [`${t.label}_proc_count`, `${t.label}_cpu_seconds`, `${t.label}_cpu_pct_delta`, `${t.label}_ram_mb`]).join(","));

const startMs = Date.now();
const samples = Math.floor(DURATION_S / INTERVAL_S) + 1;

console.error(`[bench] sampling for ${DURATION_S}s at ${INTERVAL_S}s intervals → ${samples} samples → ${OUT}`);

let prev = null;
for (let i = 0; i <= samples; i++) {
    const elapsed = (Date.now() - startMs) / 1000;
    const snap = snapshot();
    const buckets = TARGETS.map(t => ({ t, b: bucketize(snap, t) }));

    const fields = [new Date().toISOString(), elapsed.toFixed(1)];
    for (const { t, b } of buckets) {
        const prevB = prev?.find(x => x.t.label === t.label)?.b;
        const cpuDelta = prevB ? ((b.cpuTotal - prevB.cpuTotal) / INTERVAL_S) * 100 : 0;
        fields.push(b.count, b.cpuTotal.toFixed(2), cpuDelta.toFixed(2), b.wsMB.toFixed(1));
    }
    rows.push(fields.join(","));
    if (i > 0) console.error(`  t=${elapsed.toFixed(0)}s  ` + buckets.map(({ t, b }, j) => {
        const prevB = prev?.find(x => x.t.label === t.label)?.b;
        const cpuPct = prevB ? ((b.cpuTotal - prevB.cpuTotal) / INTERVAL_S) * 100 : 0;
        return `${t.label}: ${b.count}p ${cpuPct.toFixed(1)}% ${b.wsMB.toFixed(0)}MB`;
    }).join("  |  "));

    prev = buckets;
    if (i < samples) await new Promise(r => setTimeout(r, INTERVAL_S * 1000));
}

writeFileSync(OUT, rows.join("\n") + "\n");
console.error(`\n[bench] wrote ${OUT}`);
console.error("[bench] open in Excel/Sheets, average the cpu_pct_delta + ram_mb columns, compare.");
