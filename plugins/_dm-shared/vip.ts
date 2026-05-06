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

export function getMyTier(): Tier {
    const me = UserStore.getCurrentUser();
    if (!me?.id) return Tier.FREE;
    return HARDCODED_TIERS[me.id] ?? Tier.FREE;
}

export function hasTier(required: Tier): boolean {
    return getMyTier() >= required;
}

export function tierGateMessage(required: Tier): string {
    const my = TIER_LABELS[getMyTier()];
    const need = TIER_LABELS[required];
    return `${need} required (you are ${my}). Visit discordmaxxer.dev/upgrade`;
}
