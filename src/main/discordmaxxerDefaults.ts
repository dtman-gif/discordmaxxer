/*
 * Discordmaxxer — defaults seeder
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Seeds the Vencord settings.json on first launch with all of the
 * Discordmaxxer-recommended plugins enabled. On subsequent launches, only
 * adds plugins the user has never seen (so we never override choices).
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

import { VENCORD_SETTINGS_FILE } from "./constants";

const PLUGINS_DEFAULT_ON: string[] = [
    "FakeNitro",
    "MessageLogger",
    "ClearURLs",
    "AlwaysTrust",
    "ClientTheme",
    "FriendsSince",
    "ImageZoom",
    "TypingTweaks",
    "RelationshipNotifier",
    "SilentTyping",
    "GifPaste",
    "StickerPaste",
    "VolumeBooster",
    "FixCodeblockGap",
    "NoReplyMention",
    "CopyStickerLinks",
    "ValidReply",
    "BetterFolders",
    "BetterSettings",
    "MentionAvatars",
    "MoreQuickReact",
    "NewGuildSettings",
    "NoF1",
    "PinDMs",
    "ReadAllNotificationsButton",
    "SelfForward",
    "TextReplace",
    "ThemeAttributes",
    "ThemeLibrary",
    "WebKeybinds",
    "WebScreenShareFix",
    "BetterGifPicker",
    "FavoriteGifSearch",
    // Discordmaxxer custom plugins
    "TournamentMode",
    "CompactView",
    "MassDelete",
    "DiscordmaxxerBadge",
    "DiscordmaxxerTheme",
    "VideoBackground",
    "DiscordmaxxerHub"
];

const VENCORD_DEFAULTS = {
    notifyAboutUpdates: true,
    autoUpdate: true,
    autoUpdateNotification: true,
    useQuickCss: true,
    themeLinks: [],
    enabledThemes: [],
    frameless: false,
    transparent: false,
    winCtrlQ: false,
    macosVibrancyStyle: null,
    disableMinSize: false,
    winNativeTitleBar: false,
    plugins: Object.fromEntries(PLUGINS_DEFAULT_ON.map(name => [name, { enabled: true }]))
};

function readSettingsSafe(): Record<string, any> | null {
    try {
        if (!existsSync(VENCORD_SETTINGS_FILE)) return null;
        const raw = readFileSync(VENCORD_SETTINGS_FILE, "utf-8");
        return JSON.parse(raw);
    } catch (e) {
        console.warn("[Discordmaxxer] Failed to read Vencord settings.json:", e);
        return null;
    }
}

// Tracks which plugins Discordmaxxer has explicitly set as default-on. The key
// distinguishes "Vencord auto-wrote enabled:false on init" from "user toggled
// off". Once a plugin is in this list, we never touch its enabled state again.
const SEEDED_KEY = "discordmaxxerSeededPlugins";

export function seedDiscordmaxxerDefaults() {
    const existing = readSettingsSafe();

    // True first launch — no settings.json exists at all.
    if (existing === null) {
        const defaults = {
            ...VENCORD_DEFAULTS,
            [SEEDED_KEY]: [...PLUGINS_DEFAULT_ON]
        };
        try {
            writeFileSync(VENCORD_SETTINGS_FILE, JSON.stringify(defaults, null, 4));
            console.log(
                `[Discordmaxxer] First-launch seed: enabled ${PLUGINS_DEFAULT_ON.length} default plugins.`
            );
        } catch (e) {
            console.error("[Discordmaxxer] Failed to write default Vencord settings.json:", e);
        }
        return;
    }

    // Migration / new-default application path.
    const plugins = existing.plugins ?? {};
    const seeded: string[] = Array.isArray(existing[SEEDED_KEY]) ? [...existing[SEEDED_KEY]] : [];

    let added = 0;
    for (const name of PLUGINS_DEFAULT_ON) {
        if (seeded.includes(name)) continue; // user has had the chance — leave alone
        plugins[name] = { ...(plugins[name] ?? {}), enabled: true };
        seeded.push(name);
        added++;
    }

    if (added === 0) return;

    existing.plugins = plugins;
    existing[SEEDED_KEY] = seeded;
    try {
        writeFileSync(VENCORD_SETTINGS_FILE, JSON.stringify(existing, null, 4));
        console.log(`[Discordmaxxer] Applied ${added} new default(s); future user toggles will be respected.`);
    } catch (e) {
        console.error("[Discordmaxxer] Failed to update Vencord settings.json:", e);
    }
}
