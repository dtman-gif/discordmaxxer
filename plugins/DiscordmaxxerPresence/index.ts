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
 * Tier behaviour:
 * - FREE / MAXXER: presence is mandatory ON; activity name/details/
 *   state/type/button are locked to the brand defaults; "Get
 *   Discordmaxxer" button is forced visible (it's how we grow).
 * - MAXXER+ / MAXXER++: every field is freely customizable, and the
 *   user can disable the activity entirely.
 *
 * Anti-self-bot rule: this is a CLIENT-presence broadcast (the same
 * mechanism Discord apps use to show "Playing CSGO"). Not a profile
 * mutation. We set ONCE on plugin start and refresh on a low cadence
 * so the activity doesn't decay.
 */

import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { FluxDispatcher } from "@webpack/common";

import { hasTier, Tier } from "../_dm-shared/vip";

const SOCKET_ID = "Discordmaxxer";
const REFRESH_MS = 60_000;
const VIP_GATE = Tier.MAXXER_PLUS;
const isCustomizable = () => hasTier(VIP_GATE);
const isLocked = () => !isCustomizable();

const DEFAULT_NAME = "Discordmaxxer";
const DEFAULT_DETAILS = "Discord, optimized";
const DEFAULT_STATE = "discordmaxxer.dev";
const DEFAULT_BUTTON_LABEL = "Get Discordmaxxer";
const DEFAULT_BUTTON_URL = "https://github.com/MaxxTopia/discordmaxxer/releases/latest";

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
    const customizable = isCustomizable();

    // Non-VIP+ users: always show, ignore the enabled toggle.
    // VIP+ users: respect the enabled toggle.
    if (customizable && !s.enabled) return null;

    const ACTIVITY_TYPE_PLAYING = 0;
    const ACTIVITY_TYPE_COMPETING = 5;
    const ACTIVITY_TYPE_WATCHING = 3;

    const typeMap: Record<string, number> = {
        playing: ACTIVITY_TYPE_PLAYING,
        watching: ACTIVITY_TYPE_WATCHING,
        competing: ACTIVITY_TYPE_COMPETING
    };

    const showButton = customizable ? s.showButton : true;

    return {
        application_id: undefined,
        name: customizable ? (s.name || DEFAULT_NAME) : DEFAULT_NAME,
        details: customizable ? (s.details || DEFAULT_DETAILS) : DEFAULT_DETAILS,
        state: customizable ? (s.state || DEFAULT_STATE) : DEFAULT_STATE,
        type: customizable ? (typeMap[s.activityType] ?? ACTIVITY_TYPE_PLAYING) : ACTIVITY_TYPE_PLAYING,
        flags: 1, // INSTANCE — keeps the entry stable
        timestamps: s.showElapsed ? { start: Date.now() } : undefined,
        buttons: showButton ? [DEFAULT_BUTTON_LABEL] : undefined,
        metadata: showButton ? { button_urls: [DEFAULT_BUTTON_URL] } : undefined
    };
}

function refresh() {
    setActivity(buildActivity());
}

const settings = definePluginSettings({
    enabled: {
        type: OptionType.BOOLEAN,
        description:
            "Show 'Playing Discordmaxxer' so friends see what client you use. " +
            "Locked ON for FREE / MAXXER tier; MAXXER+ and above can disable.",
        default: true,
        disabled: isLocked,
        onChange: refresh
    },
    activityType: {
        type: OptionType.SELECT,
        description: "How the activity displays: 'Playing X', 'Watching X', or 'Competing in X'. (MAXXER+)",
        default: "playing",
        options: [
            { label: "Playing Discordmaxxer", value: "playing", default: true },
            { label: "Watching Discordmaxxer", value: "watching" },
            { label: "Competing in Discordmaxxer", value: "competing" }
        ],
        disabled: isLocked,
        onChange: refresh
    },
    name: {
        type: OptionType.STRING,
        description: "Activity name (the bold line in the user list). (MAXXER+)",
        default: DEFAULT_NAME,
        disabled: isLocked,
        onChange: refresh
    },
    details: {
        type: OptionType.STRING,
        description: "First details line under the activity name. (MAXXER+)",
        default: DEFAULT_DETAILS,
        disabled: isLocked,
        onChange: refresh
    },
    state: {
        type: OptionType.STRING,
        description: "Second details line (shows under details). (MAXXER+)",
        default: DEFAULT_STATE,
        disabled: isLocked,
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
        description:
            "Show a 'Get Discordmaxxer' button on your activity card (visible on profile hover). " +
            "Forced ON for FREE / MAXXER tier.",
        default: true,
        disabled: isLocked,
        onChange: refresh
    }
});

export default definePlugin({
    name: "DiscordmaxxerPresence",
    description:
        "Broadcasts 'Playing Discordmaxxer' as your activity so friends see what client you use. " +
        "Standard rich-presence — no profile mutations. " +
        "FREE / MAXXER tier: locked ON with brand defaults (it's how we grow). " +
        "MAXXER+ tier: customize text, type, button, or disable entirely.",
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
