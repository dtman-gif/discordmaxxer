/*
 * Discordmaxxer — remote tier roster (Phase 1)
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Fetches the project-wide tier roster on app startup and caches it for 1
 * hour. The roster is a JSON file at a stable URL — see docs/v0.2-tier-
 * roster.md for the design and the migration path to the hub-site domain.
 *
 * NOT a Vencord plugin — just a shared utility imported by vip.ts. Lives
 * under plugins/_dm-shared/ which Vencord's build skips for plugin
 * registration (folders starting with "_") but still includes in the
 * bundle when imported.
 *
 * Phase 1 scope:
 *   - Fetch + parse + cache on first call
 *   - Expiration check (entries past expiresAt are ignored)
 *   - Synchronous read from cache via getRosterTier(userId)
 *   - Silent failure — bad fetch / parse / network = empty roster
 *
 * Phase 2+ adds: "renewing soon" UX, grace period, signed grants,
 * subscription webhook integration. Roadmap in the design doc.
 */

import { Tier } from "./vip";

// Eventually swappable for a custom-domain URL once the hub site exists.
// See docs/v0.2-tier-roster.md "Domain & hub integration" — this single
// constant is the swap point.
const ROSTER_URL =
    "https://raw.githubusercontent.com/dtman-gif/discordmaxxer/main/data/tiers.json";

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 8000;

interface RosterEntry {
    tier: Tier;
    via?: "owner" | "subscription" | "grant" | "comp";
    grantedAt?: string;
    expiresAt?: string | null; // ISO 8601, null = never expires
    grantedBy?: string;
}

interface RosterPayload {
    version: number;
    issuedAt: string;
    users: Record<string, RosterEntry>;
}

interface CacheState {
    fetchedAt: number;
    users: Record<string, RosterEntry>;
}

let cache: CacheState | null = null;
let inFlight: Promise<void> | null = null;

const SUPPORTED_VERSION = 1;

function isExpired(entry: RosterEntry): boolean {
    if (!entry.expiresAt) return false; // null / undefined = never expires
    const t = Date.parse(entry.expiresAt);
    if (isNaN(t)) return false; // bad date treated as never expires (safer than always-expired)
    return t < Date.now();
}

async function doFetch(): Promise<void> {
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        let res: Response;
        try {
            res = await fetch(ROSTER_URL, { cache: "no-cache", signal: ctrl.signal });
        } finally {
            clearTimeout(timer);
        }
        if (!res.ok) {
            console.warn(`[Discordmaxxer roster] fetch ${ROSTER_URL} -> ${res.status}`);
            cache = { fetchedAt: Date.now(), users: cache?.users ?? {} };
            return;
        }
        const payload = (await res.json()) as RosterPayload;
        if (typeof payload?.version !== "number" || payload.version > SUPPORTED_VERSION) {
            console.warn(`[Discordmaxxer roster] unsupported version: ${payload?.version}`);
            cache = { fetchedAt: Date.now(), users: cache?.users ?? {} };
            return;
        }
        if (!payload.users || typeof payload.users !== "object") {
            console.warn("[Discordmaxxer roster] missing/invalid users map");
            cache = { fetchedAt: Date.now(), users: cache?.users ?? {} };
            return;
        }
        cache = { fetchedAt: Date.now(), users: payload.users };
    } catch (e) {
        // Network error / abort / parse fail — keep prior cache if any, just
        // refresh the timestamp so we don't hammer the URL on every read.
        console.warn("[Discordmaxxer roster] fetch failed:", (e as any)?.message ?? e);
        cache = { fetchedAt: Date.now(), users: cache?.users ?? {} };
    }
}

function ensureFresh() {
    const stale = !cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS;
    if (!stale || inFlight) return;
    inFlight = doFetch().finally(() => { inFlight = null; });
}

/**
 * Synchronous lookup. Triggers a background refresh if the cache is stale or
 * empty, but always returns the current cached value (Tier.FREE if nothing
 * cached yet). Callers should accept that the very first call after launch
 * may return FREE for a roster-listed user — the next call (after the fetch
 * resolves) will see the elevated tier. UI surfaces that depend on tier
 * (badge, VIP card, presence gate) re-render on Vencord settings changes,
 * which is enough to pick up the roster on second paint.
 */
export function getRosterTier(userId: string): Tier {
    ensureFresh();
    if (!cache) return Tier.FREE;
    const entry = cache.users[userId];
    if (!entry || isExpired(entry)) return Tier.FREE;
    return entry.tier;
}

/** Force-refresh on demand (e.g., from a "Refresh roster" Hub button). */
export function refreshRoster(): Promise<void> {
    cache = null;
    ensureFresh();
    return inFlight ?? Promise.resolve();
}

/** Diagnostic — used by the VIP card / Hub to show "Last synced: 12 min ago". */
export function getRosterStatus(): { fetchedAt: number | null; userCount: number } {
    return {
        fetchedAt: cache?.fetchedAt ?? null,
        userCount: cache ? Object.keys(cache.users).length : 0
    };
}
