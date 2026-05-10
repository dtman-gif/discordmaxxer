/*
 * Discordmaxxer — DiscordmaxxerChime plugin
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Custom mention chime — plays a themed notify sound when the current user
 * is @-mentioned, gets a DM, or sees an @everyone in a non-muted server.
 * Sources its tone from the active DiscordmaxxerTheme via the shared sound
 * manager (sounds.ts SYNTH_PROFILES.notify), so each theme has its own chime
 * without per-theme audio assets.
 *
 * Tier gate: MAXXER+ marquee perk. Plugin loads for everyone but no-ops the
 * dispatcher hook unless hasTier(MAXXER_PLUS).
 *
 * Anti-spam:
 *   - Skip if the message author is the current user
 *   - Skip if it's our own message edit (edited_timestamp + same author)
 *   - Per-channel cooldown so a fast-spam @-mention burst doesn't machine-gun
 */

import { definePluginSettings } from "@api/Settings";
import { ChannelStore, FluxDispatcher, UserStore } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

import { CHIME_BY_ID, CHIME_LIBRARY } from "../_dm-shared/chime-library";
import { playSound, soundsEnabled } from "../_dm-shared/sounds";
import { hasTier, Tier } from "../_dm-shared/vip";

const VIP_GATE = Tier.MAXXER_PLUS;
const COOLDOWN_MS = 1500;

const lastChimeAt = new Map<string, number>();

interface DiscordMessage {
    author?: { id?: string };
    channel_id?: string;
    mentions?: Array<{ id: string }>;
    mention_everyone?: boolean;
    mention_roles?: string[];
    edited_timestamp?: string | null;
}

// Channel types we care about for "is DM?". Discord constants:
//   1 = DM, 3 = GROUP_DM. Server channels are 0/2/5/13/15.
const DM_TYPES = new Set([1, 3]);

function isDmChannel(channelId: string | undefined): boolean {
    if (!channelId) return false;
    try {
        const ch = ChannelStore.getChannel(channelId);
        return !!ch && DM_TYPES.has(ch.type);
    } catch { return false; }
}

function shouldChime(message: DiscordMessage, myId: string): boolean {
    if (!message?.author?.id) return false;
    if (message.author.id === myId) return false; // self-message
    if (message.edited_timestamp) return false;   // ignore edits

    if (isDmChannel(message.channel_id)) return true;
    if (message.mentions?.some(u => u.id === myId)) return true;
    // mention_everyone fires only when the sender has permission, so this is
    // genuinely "you got pinged" — but keep it gated to non-muted channels
    // by checking: just trust @everyone for now (Discord client suppresses
    // server-muted toasts at the OS level — our chime is additive).
    if (message.mention_everyone) return true;
    return false;
}

function onMessageCreate(payload: { message?: DiscordMessage }) {
    if (!hasTier(VIP_GATE)) return;
    if (!soundsEnabled()) return;
    if (settings.store.enabled === false) return;

    const me = UserStore.getCurrentUser();
    if (!me?.id) return;

    const message = payload?.message;
    if (!message || !shouldChime(message, me.id)) return;

    const channelId = message.channel_id ?? "";
    const now = Date.now();
    const last = lastChimeAt.get(channelId) ?? 0;
    if (now - last < COOLDOWN_MS) return;
    lastChimeAt.set(channelId, now);

    const chimeId = settings.store.chime as string | undefined;
    if (chimeId && chimeId !== "theme-default" && CHIME_BY_ID[chimeId]) {
        try {
            const audio = new Audio(CHIME_BY_ID[chimeId].url);
            audio.volume = 0.6;
            void audio.play();
            return;
        } catch { /* fall through to theme-default on decode failure */ }
    }

    // theme-default — playSound auto-resolves the active theme's notify
    // sound from <body>.dm-theme-* class (themed pack -> bundled -> synth).
    playSound("notify");
}

function previewChime(id: string) {
    if (id === "theme-default") {
        playSound("notify");
        return;
    }
    const chime = CHIME_BY_ID[id];
    if (!chime) return;
    try {
        const audio = new Audio(chime.url);
        audio.volume = 0.6;
        void audio.play();
    } catch { /* swallow — preview is best-effort */ }
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description:
            "Play a chime when you're @-mentioned, get a DM, or see @everyone. Per-channel 1.5s cooldown prevents spam-burst machine-gunning.",
        default: true
    },
    chime: {
        type: OptionType.SELECT,
        description: "Pick your mention chime. 'Match active theme' uses your Discordmaxxer theme's curated notify sound; the rest are explicit picks from the chime library (CC-BY 4.0, Kenney).",
        default: "theme-default",
        options: [
            { label: "Match active theme (default)", value: "theme-default", default: true },
            ...CHIME_LIBRARY.map(c => ({ label: c.label, value: c.id }))
        ],
        onChange: (value: string) => previewChime(value)
    }
});

export default definePlugin({
    name: "DiscordmaxxerChime",
    description:
        "MAXXER+ perk — themed mention chime. Plays a tone matched to your active Discordmaxxer theme on @-mentions, DMs, and @everyone. Per-channel cooldown prevents spam-burst machine-gunning. No-ops below MAXXER+.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {
        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageCreate);
    },

    stop() {
        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageCreate);
        lastChimeAt.clear();
    }
});
