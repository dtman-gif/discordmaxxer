/*
 * Discordmaxxer — VIP claim client
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Talks to the Cloudflare Worker that serves as the first-claim-wins
 * ledger for VIP redemption codes. The same worker shared with
 * optimizationmaxxing — codes are interchangeable across products
 * because both compute HWID the same way (BIOS UUID + serial + CPU).
 *
 * Worker contract (POST /claim):
 *   request:  { code, hwid }
 *   response 200 + status="claimed":    new claim, code now bound
 *   response 200 + status="idempotent": same code+hwid as before, OK
 *   response 409:                        code claimed by a different rig
 *   response 400:                        malformed code or hwid
 *
 * Validation strategy: on plugin start, re-POST stored {code, hwid} to
 * the worker. Idempotent response keeps the binding alive. 409 wipes the
 * local binding (someone else claimed it OR we changed rigs). Network
 * failure trusts the cache for 24h before downgrading to FREE.
 */

import { Tier } from "./vip";

export const WORKER_URL = "https://optmaxxing-vip.maxxtopia.workers.dev/claim";

export interface ClaimBinding {
    /** The 16-char Crockford code (no MAXX- prefix, no dashes). */
    code: string;
    /** The HWID this binding is locked to. */
    hwid: string;
    /** Tier granted by this binding. v0.1 always MAXXER_PLUS_PLUS. */
    tier: Tier;
    /** Unix ms when last successfully validated against the worker. */
    lastValidatedAt: number;
    /** Unix ms when the original claim happened. */
    claimedAt: number;
}

export const OFFLINE_TRUST_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RE_VALIDATE_AFTER_MS = 60 * 60 * 1000; // 1 hour

const CODE_RE = /^[0-9A-HJKMNP-Z]{16}$/;

/** Strip MAXX- prefix + dashes, uppercase. Matches worker normalization. */
export function normalizeCode(input: string): string {
    return input
        .toUpperCase()
        .replace(/^MAXX-?/, "")
        .replace(/[\s-]/g, "");
}

export function isValidCode(input: string): boolean {
    return CODE_RE.test(normalizeCode(input));
}

export interface ClaimResult {
    ok: boolean;
    status?: "claimed" | "idempotent";
    error?: string;
    boundHwid?: string;
}

/** First-time claim or idempotent re-claim against the worker. */
export async function claimAgainstWorker(code: string, hwid: string): Promise<ClaimResult> {
    try {
        const res = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: normalizeCode(code), hwid })
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.ok) {
            return { ok: true, status: body.status, boundHwid: body.boundHwid };
        }
        return { ok: false, error: body?.error || `http ${res.status}`, boundHwid: body?.boundHwid };
    } catch (e: any) {
        return { ok: false, error: `network: ${e?.message || e}` };
    }
}

/**
 * Validate an existing binding. Returns:
 *   - true if the worker confirms idempotent re-claim (binding is alive)
 *   - false if the worker rejects (claim was nuked or different hwid)
 *   - null if the network is unreachable (caller decides whether to trust cache)
 */
export async function reValidateBinding(b: ClaimBinding): Promise<boolean | null> {
    const r = await claimAgainstWorker(b.code, b.hwid);
    if (r.ok && r.status === "idempotent") return true;
    if (r.ok && r.status === "claimed") return true; // first re-claim after worker KV reset
    if (!r.ok && r.error?.startsWith("network")) return null;
    return false;
}

const STORE_KEY = "dm-vip-claim";

export function readBinding(): ClaimBinding | null {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        if (!raw) return null;
        const b = JSON.parse(raw) as ClaimBinding;
        // Sanity-check shape so a malformed store doesn't crash callers.
        if (typeof b?.code !== "string" || typeof b?.hwid !== "string") return null;
        if (!isValidCode(b.code) || b.hwid.length !== 32) return null;
        return b;
    } catch {
        return null;
    }
}

export function writeBinding(b: ClaimBinding | null): void {
    try {
        if (b === null) localStorage.removeItem(STORE_KEY);
        else localStorage.setItem(STORE_KEY, JSON.stringify(b));
    } catch {}
}

/**
 * Tier resolution from local binding alone (no network). Used for
 * synchronous tier checks. Trusts the cache for OFFLINE_TRUST_MS.
 */
export function tierFromCachedBinding(): Tier {
    const b = readBinding();
    if (!b) return Tier.FREE;
    const ageMs = Date.now() - b.lastValidatedAt;
    if (ageMs < OFFLINE_TRUST_MS) return b.tier;
    return Tier.FREE;
}

/** Refresh a binding's lastValidatedAt without changing other fields. */
export function bumpValidatedAt(b: ClaimBinding): ClaimBinding {
    return { ...b, lastValidatedAt: Date.now() };
}

/** Async HWID retrieval via the VesktopNative bridge. */
export async function getMyHwid(): Promise<string | null> {
    try {
        const native = (globalThis as any).VesktopNative?.hwid;
        if (!native?.get) return null;
        const r = await native.get();
        if (r?.ok && typeof r.hwid === "string") return r.hwid;
        return null;
    } catch {
        return null;
    }
}
