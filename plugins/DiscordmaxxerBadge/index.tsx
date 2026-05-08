/*
 * Discordmaxxer — DiscordmaxxerBadge plugin (Channels A, B, C, D)
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Identity layer with four channels:
 *   A) Profile badge (mod-side only, default-on)
 *   B) Custom status (vanilla-visible, opt-in via toggle)
 *   C) Bio append (vanilla-visible, opt-in)
 *   D) Pronouns tag (vanilla-visible, opt-in only when pronouns are empty)
 *
 * Anti-self-bot rules: B/C/D are PATCHed exactly ONCE when the user flips a
 * toggle from off->on. We never re-assert on subsequent launches. If the user
 * clears the value via Discord's UI, we don't fight them. Toggling off does
 * NOT undo (user reverts via Discord normally).
 */

import { addProfileBadge, BadgePosition, ProfileBadge, removeProfileBadge } from "@api/Badges";
import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { RestAPI, Toasts, UserStore } from "@webpack/common";

// Profile-badge mark — simplified signal-bars version of build/icon.svg.
// Three ascending bars on Discord blurple = "max signal" metaphor.
// Stays readable at 16x16 badge size where the full chat-bubble logo loses detail.
// Same brand gradient, no text, optimized for 24x24 rendering in user popouts.
const BADGE_ICON =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
        `<defs>` +
        `<radialGradient id="dmg" cx="35%" cy="32%" r="78%">` +
        `<stop offset="0%" stop-color="#8a98ff"/>` +
        `<stop offset="60%" stop-color="#5865F2"/>` +
        `<stop offset="100%" stop-color="#2c34c4"/>` +
        `</radialGradient>` +
        `<linearGradient id="dmb1" x1="50%" y1="0%" x2="50%" y2="100%">` +
        `<stop offset="0%" stop-color="#ffaaff"/><stop offset="100%" stop-color="#ff5dff"/>` +
        `</linearGradient>` +
        `<linearGradient id="dmb2" x1="50%" y1="0%" x2="50%" y2="100%">` +
        `<stop offset="0%" stop-color="#d0a4ff"/><stop offset="100%" stop-color="#9a5fff"/>` +
        `</linearGradient>` +
        `<linearGradient id="dmb3" x1="50%" y1="0%" x2="50%" y2="100%">` +
        `<stop offset="0%" stop-color="#a5b1ff"/><stop offset="100%" stop-color="#5865F2"/>` +
        `</linearGradient>` +
        `</defs>` +
        `<circle cx="12" cy="12" r="11" fill="url(#dmg)"/>` +
        `<rect x="5.5" y="14" width="2.5" height="4" rx="0.5" fill="url(#dmb1)"/>` +
        `<rect x="9.5" y="11" width="2.5" height="7" rx="0.5" fill="url(#dmb2)"/>` +
        `<rect x="13.5" y="7.5" width="2.5" height="10.5" rx="0.5" fill="url(#dmb3)"/>` +
        `<circle cx="14.75" cy="7.4" r="1" fill="#ff5dff"/>` +
        `<circle cx="14.75" cy="7.4" r="0.5" fill="#ffe0ff"/>` +
        `</svg>`
    );

const DEFAULT_STATUS_TEXT = "Using Discordmaxxer";
const DEFAULT_BIO_LINE = "— Using Discordmaxxer (discordmaxxer.dev)";
const DEFAULT_PRONOUNS_TAG = "dm.gg";

function toast(msg: string, type: any = Toasts.Type.SUCCESS) {
    Toasts.show({
        message: msg,
        type,
        id: Toasts.genId(),
        options: { duration: 3000, position: Toasts.Position.TOP }
    });
}

async function applyCustomStatus(text: string) {
    try {
        await RestAPI.patch({
            url: "/users/@me/settings",
            body: { custom_status: { text } }
        });
        toast(`✅ Custom status set to "${text}"`);
        return true;
    } catch (e) {
        console.warn("[DiscordmaxxerBadge] applyCustomStatus failed:", e);
        toast("Failed to set custom status — see console", Toasts.Type.FAILURE);
        return false;
    }
}

async function applyBioAppend(line: string) {
    try {
        const me = UserStore.getCurrentUser() as any;
        const currentBio: string = me?.bio ?? "";
        if (currentBio.includes(line.trim())) {
            toast("Bio already contains the Discordmaxxer line — no change.");
            return true;
        }
        const newBio = currentBio.length ? `${currentBio.trimEnd()}\n${line}` : line;
        await RestAPI.patch({
            url: "/users/@me/profile",
            body: { bio: newBio }
        });
        toast("✅ Bio updated");
        return true;
    } catch (e) {
        console.warn("[DiscordmaxxerBadge] applyBioAppend failed:", e);
        toast("Failed to update bio — see console", Toasts.Type.FAILURE);
        return false;
    }
}

async function applyPronouns(tag: string) {
    try {
        const me = UserStore.getCurrentUser() as any;
        const currentPronouns: string = me?.pronouns ?? "";
        if (currentPronouns.trim().length > 0) {
            toast(
                `Pronouns already set to "${currentPronouns}" — not overwriting. Clear them in Discord first if you want the DM tag.`,
                Toasts.Type.MESSAGE
            );
            return false;
        }
        await RestAPI.patch({
            url: "/users/@me/profile",
            body: { pronouns: tag }
        });
        toast(`✅ Pronouns set to "${tag}"`);
        return true;
    } catch (e) {
        console.warn("[DiscordmaxxerBadge] applyPronouns failed:", e);
        toast("Failed to set pronouns — see console", Toasts.Type.FAILURE);
        return false;
    }
}

const settings = definePluginSettings({
    // Channel A — profile badge
    showOnOwnProfile: {
        type: OptionType.BOOLEAN,
        description: "[Channel A] Show the DM badge on your own profile (visible to other Discordmaxxer users)",
        default: true
    },
    extraUserIds: {
        type: OptionType.STRING,
        description: "[Channel A] Comma-separated additional user IDs to show the badge for",
        default: ""
    },
    remoteListUrl: {
        type: OptionType.STRING,
        description: "[Channel A] Optional URL returning a JSON array of user IDs (fetched once on plugin start)",
        default: ""
    },

    // Channel B — Custom status
    customStatusOnce: {
        type: OptionType.BOOLEAN,
        description:
            "[Channel B] APPLY ONCE — set your Discord custom status to the text below. Toggling this on PATCHes Discord; toggling off does nothing (clear via Discord). Vanilla Discord users will see this.",
        default: false,
        onChange: (value: boolean) => {
            if (value) applyCustomStatus(settings.store.customStatusText.trim() || DEFAULT_STATUS_TEXT);
        }
    },
    customStatusText: {
        type: OptionType.STRING,
        description: "[Channel B] Custom status text",
        default: DEFAULT_STATUS_TEXT
    },

    // Channel C — Bio append
    bioAppendOnce: {
        type: OptionType.BOOLEAN,
        description:
            "[Channel C] APPLY ONCE — append the line below to your About Me. Will not duplicate if already present. Vanilla Discord users see this when they click your profile.",
        default: false,
        onChange: (value: boolean) => {
            if (value) applyBioAppend(settings.store.bioAppendText.trim() || DEFAULT_BIO_LINE);
        }
    },
    bioAppendText: {
        type: OptionType.STRING,
        description: "[Channel C] Line to append to your existing bio",
        default: DEFAULT_BIO_LINE
    },

    // Channel D — Pronouns tag
    pronounsOnce: {
        type: OptionType.BOOLEAN,
        description:
            "[Channel D] APPLY ONCE — set your pronouns to the tag below, ONLY if pronouns are currently empty. Vanilla Discord users see pronouns wherever they render.",
        default: false,
        onChange: (value: boolean) => {
            if (value) applyPronouns(settings.store.pronounsTag.trim() || DEFAULT_PRONOUNS_TAG);
        }
    },
    pronounsTag: {
        type: OptionType.STRING,
        description: "[Channel D] Pronouns tag (max 40 chars)",
        default: DEFAULT_PRONOUNS_TAG
    }
});

const knownIds = new Set<string>();

function rebuildKnownIds() {
    knownIds.clear();
    if (settings.store.showOnOwnProfile) {
        const me = UserStore.getCurrentUser();
        if (me?.id) knownIds.add(me.id);
    }
    settings.store.extraUserIds
        .split(",")
        .map(s => s.trim())
        .filter(Boolean)
        .forEach(id => knownIds.add(id));
}

async function loadRemoteList() {
    const url = settings.store.remoteListUrl?.trim();
    if (!url) return;
    try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
            console.warn(`[DiscordmaxxerBadge] remote list fetch ${res.status}`);
            return;
        }
        const ids: unknown = await res.json();
        if (!Array.isArray(ids)) {
            console.warn("[DiscordmaxxerBadge] remote list is not an array");
            return;
        }
        let added = 0;
        for (const id of ids) {
            if (typeof id === "string" && id.length >= 17) {
                if (!knownIds.has(id)) added++;
                knownIds.add(id);
            }
        }
        console.log(`[DiscordmaxxerBadge] remote list loaded: +${added} new (${knownIds.size} total)`);
    } catch (e) {
        console.warn("[DiscordmaxxerBadge] remote list load failed:", e);
    }
}

const badge: ProfileBadge = {
    id: "discordmaxxer-user",
    description: "Discordmaxxer user — discord, optimized",
    iconSrc: BADGE_ICON,
    link: "https://maxxtopia.com/discordmaxxer",
    position: BadgePosition.START,
    shouldShow: ({ userId }) => knownIds.has(userId)
};

export default definePlugin({
    name: "DiscordmaxxerBadge",
    description:
        "Identity layer for Discordmaxxer. Channel A: a small DM badge on your profile (mod-only visibility). " +
        "Channels B/C/D: opt-in toggles to set custom status, bio line, or pronouns tag — applied ONCE per flip, " +
        "never re-asserted. Vanilla Discord users see B/C/D. Configure each channel's text in settings, " +
        "then flip its toggle on to apply. Disable a channel by clearing it in Discord normally.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    async start() {
        rebuildKnownIds();
        addProfileBadge(badge);
        await loadRemoteList();
    },

    stop() {
        removeProfileBadge(badge);
        knownIds.clear();
    }
});
