/*
 * Discordmaxxer — Rich Presence
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Broadcasts a "Playing Discordmaxxer" activity so the user shows up
 * in friends' member lists with the brand. Uses the same FluxDispatcher
 * LOCAL_ACTIVITY_UPDATE path as LastFMRichPresence — the gateway then
 * syncs the activity to the server.
 *
 * Anti-self-bot rule: this is a CLIENT-presence broadcast (the same
 * mechanism Discord apps use to show "Playing CSGO"). Not a profile
 * mutation. User can disable any time; we set ONCE on plugin start
 * and refresh on a low cadence so the activity doesn't decay.
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

const SOCKET_ID = "Discordmaxxer";
const REFRESH_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

function setActivity(activity: any | null) {
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        socketId: SOCKET_ID
    });
}

function buildActivity() {
    const s = settings.store;
    if (!s.enabled) return null;

    const ACTIVITY_TYPE_PLAYING = 0;
    const ACTIVITY_TYPE_COMPETING = 5;
    const ACTIVITY_TYPE_WATCHING = 3;

    const typeMap: Record<string, number> = {
        playing: ACTIVITY_TYPE_PLAYING,
        watching: ACTIVITY_TYPE_WATCHING,
        competing: ACTIVITY_TYPE_COMPETING
    };

    return {
        application_id: undefined,
        name: s.name || "Discordmaxxer",
        details: s.details || "Discord, optimized",
        state: s.state || "discordmaxxer.dev",
        type: typeMap[s.activityType] ?? ACTIVITY_TYPE_PLAYING,
        flags: 1, // INSTANCE — keeps the entry stable
        timestamps: s.showElapsed ? { start: Date.now() } : undefined,
        buttons: s.showButton ? ["Get Discordmaxxer"] : undefined,
        metadata: s.showButton
            ? { button_urls: ["https://discordmaxxer.dev"] }
            : undefined
    };
}

function refresh() {
    setActivity(buildActivity());
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description: "Show 'Playing Discordmaxxer' in your status so friends see what client you use.",
        default: true,
        onChange: refresh
    },
    activityType: {
        type: OptionType.SELECT,
        description: "How the activity displays: 'Playing X', 'Watching X', or 'Competing in X'.",
        default: "playing",
        options: [
            { label: "Playing Discordmaxxer", value: "playing", default: true },
            { label: "Watching Discordmaxxer", value: "watching" },
            { label: "Competing in Discordmaxxer", value: "competing" }
        ],
        onChange: refresh
    },
    name: {
        type: OptionType.STRING,
        description: "Activity name (the bold line in user list).",
        default: "Discordmaxxer",
        onChange: refresh
    },
    details: {
        type: OptionType.STRING,
        description: "First details line under the activity name.",
        default: "Discord, optimized",
        onChange: refresh
    },
    state: {
        type: OptionType.STRING,
        description: "Second details line (shows under details).",
        default: "discordmaxxer.dev",
        onChange: refresh
    },
    showElapsed: {
        type: OptionType.BOOLEAN,
        description: "Show 'XX:XX elapsed' timer.",
        default: true,
        onChange: refresh
    },
    showButton: {
        type: OptionType.BOOLEAN,
        description: "Show a 'Get Discordmaxxer' button on your activity card (visible on profile hover).",
        default: false,
        onChange: refresh
    }
});

export default definePlugin({
    name: "DiscordmaxxerPresence",
    description:
        "Broadcasts 'Playing Discordmaxxer' as your activity so friends see what client you use. Uses the standard rich-presence pipeline — no profile mutations. Disable any time.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {
        refresh();
        timer = setInterval(refresh, REFRESH_MS);
    },

    stop() {
        if (timer) clearInterval(timer);
        timer = null;
        setActivity(null);
    }
});
