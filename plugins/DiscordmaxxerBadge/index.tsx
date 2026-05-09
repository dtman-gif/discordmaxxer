/*
 * Discordmaxxer — DiscordmaxxerBadge plugin (Channels A, B, C, D)
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Identity layer:
 *   A) Profile badge (mod-side only, default-on)
 *   C) Bio append (vanilla-visible, opt-in)
 *   D) Pronouns tag (vanilla-visible, opt-in only when pronouns are empty)
 *
 * Channel B (custom status) was retired — DiscordmaxxerPresence broadcasts
 * "Playing Discordmaxxer" via gateway rich presence with the brand logo,
 * which supersedes a custom-status string. A clear toggle remains so
 * existing users can wipe a previously-set "Using Discordmaxxer" status.
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

// Profile-badge mark — v1 horror-Clyde thumbnail (96px PNG with cream
// background as the "sticker" frame). Renders at ~24x24 in user popouts;
// at that size the bullet-hole detail still reads as a distinct "shot up
// Discord mascot" identity. Cream bg works against both light and dark
// Discord themes.
const BADGE_ICON =
    "data:image/png;base64,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";

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

async function clearCustomStatus() {
    try {
        await RestAPI.patch({
            url: "/users/@me/settings",
            body: { custom_status: null }
        });
        toast("✅ Custom status cleared");
        return true;
    } catch (e) {
        console.warn("[DiscordmaxxerBadge] clearCustomStatus failed:", e);
        toast("Failed to clear custom status — see console", Toasts.Type.FAILURE);
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

    // Channel B retired — DiscordmaxxerPresence broadcasts "Playing
    // Discordmaxxer" via gateway rich presence with the brand logo, which
    // is strictly better than a custom-status string. This toggle only
    // remains so existing users can clear a previously-set status.
    clearLegacyStatus: {
        type: OptionType.BOOLEAN,
        description:
            "Clear any 'Using Discordmaxxer' custom status set by a prior version. Flip ON once to PATCH custom_status to null. Toggling OFF does nothing.",
        default: false,
        onChange: (value: boolean) => {
            if (value) clearCustomStatus();
        }
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
        "Channels C/D: opt-in toggles to append a bio line or set a pronouns tag — applied ONCE per flip, " +
        "never re-asserted. Vanilla Discord users see C/D. " +
        "Custom-status broadcasting was retired — see DiscordmaxxerPresence (rich presence card with brand logo) instead.",
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
