/*
 * Discordmaxxer — VIP tier system
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Internal tier ladder (Hypixel-style) for gating premium features. Tiers
 * cascade: a higher tier grants access to all lower-tier features.
 *
 * v0.1: hardcoded supporter list. Real payment integration is its own project.
 *
 * NOT a Vencord plugin — just a shared utility imported by plugins that need
 * tier checks. Lives under plugins/_dm-shared/ which Vencord's build skips
 * (folders starting with "_").
 */

import { UserStore } from "@webpack/common";

import { getRosterTier } from "./roster";

export const enum Tier {
    FREE = 0,
    MAXXER = 1,
    MAXXER_PLUS = 2,
    MAXXER_PLUS_PLUS = 3
}

export const TIER_LABELS: Record<Tier, string> = {
    [Tier.FREE]: "FREE",
    [Tier.MAXXER]: "MAXXER",
    [Tier.MAXXER_PLUS]: "MAXXER+",
    [Tier.MAXXER_PLUS_PLUS]: "MAXXER++"
};

// Hardcoded supporter list. Replace with remote-fetched JSON in a later
// session once we have the GitHub-Pages users.json infrastructure live.
const HARDCODED_TIERS: Record<string, Tier> = {
    "1501342589318594625": Tier.MAXXER_PLUS_PLUS // Diggy (project owner)
};

// Hardcoded admin list — only these users can use DiscordmaxxerGrant
// (right-click -> Grant Tier) and only their local grants are honored
// when rendering OTHER users' tier badges. Self-tier resolution NEVER
// reads local grants — only HARDCODED_TIERS or a worker-validated
// VipClaim binding. This is the structural fix against settings.json
// editing for self-promotion.
const ADMINS: ReadonlySet<string> = new Set([
    "1501342589318594625" // Diggy
]);

export function isAdmin(userId?: string): boolean {
    if (userId) return ADMINS.has(userId);
    try {
        const me = UserStore.getCurrentUser();
        return !!me?.id && ADMINS.has(me.id);
    } catch {
        return false;
    }
}

/** Read tier from the VipClaim binding cache without importing the module
 *  (avoids circular dep — vipClaim imports vip for the Tier enum). */
function tierFromClaimCache(): Tier {
    try {
        const raw = localStorage.getItem("dm-vip-claim");
        if (!raw) return Tier.FREE;
        const b = JSON.parse(raw);
        if (typeof b?.tier !== "number") return Tier.FREE;
        const ageMs = Date.now() - (b?.lastValidatedAt ?? 0);
        if (ageMs > 24 * 60 * 60 * 1000) return Tier.FREE; // offline trust window
        return b.tier as Tier;
    } catch {
        return Tier.FREE;
    }
}

// Local grants are managed by the DiscordmaxxerGrant plugin (right-click any
// user -> Grant Discordmaxxer Tier). We read them via Vencord.PlainSettings
// instead of importing the plugin to avoid a circular dep — vip.ts gets
// imported by plugins, including DiscordmaxxerGrant itself.
function getLocalGrants(): Record<string, Tier> {
    try {
        const raw = (globalThis as any).Vencord?.PlainSettings?.plugins?.DiscordmaxxerGrant?.grants;
        if (!raw) return {};
        return JSON.parse(raw) as Record<string, Tier>;
    } catch {
        return {};
    }
}

export function getUserTier(userId: string): Tier {
    // Resolution order:
    //   1. HARDCODED_TIERS — project-owner / fallback baked into the build
    //   2. remote roster   — central source of truth (subscriptions + grants)
    //   3. local grants    — admin-only; ignored for non-admin viewers
    //   4. FREE
    if (HARDCODED_TIERS[userId] !== undefined) return HARDCODED_TIERS[userId];
    const remote = getRosterTier(userId);
    if (remote !== Tier.FREE) return remote;
    if (isAdmin()) {
        const grants = getLocalGrants();
        return grants[userId] ?? Tier.FREE;
    }
    return Tier.FREE;
}

export function getMyTier(): Tier {
    const me = UserStore.getCurrentUser();
    if (!me?.id) return Tier.FREE;
    // Self-tier resolution NEVER reads local grants — that path is only
    // for admins decorating OTHER users' badges. For self, use only:
    //   1. HARDCODED_TIERS  — admin baked into the build
    //   2. claim cache      — worker-validated VIP code binding
    //   3. FREE
    if (HARDCODED_TIERS[me.id] !== undefined) return HARDCODED_TIERS[me.id];
    const cached = tierFromClaimCache();
    if (cached !== Tier.FREE) return cached;
    return Tier.FREE;
}

export function hasTier(required: Tier): boolean {
    return getMyTier() >= required;
}

export function tierGateMessage(required: Tier): string {
    const my = TIER_LABELS[getMyTier()];
    const need = TIER_LABELS[required];
    return `${need} required (you are ${my}). Visit discordmaxxer.dev/upgrade`;
}
