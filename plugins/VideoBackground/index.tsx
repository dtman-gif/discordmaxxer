/*
 * Discordmaxxer — VideoBackground plugin (VIP+ feature)
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Plays an MP4 (or any browser-supported video) as a full-window background
 * behind Discord's UI, with adjustable opacity and blur. Discord chrome stays
 * fully usable on top.
 *
 * VIP+ feature — gated by Tier.MAXXER_PLUS. Plugin loads for all users so the
 * settings panel shows the upgrade message; actual video injection only fires
 * when the tier check passes.
 *
 * v0.1 limitation: video URL must be http(s):// or a vesktop:// asset path.
 * Direct file:// paths are blocked by Discord's CSP. To use a local file,
 * host it on a personal CDN or copy into Vesktop's user-assets dir. A proper
 * file-picker integration ships in a later release.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { Toasts } from "@webpack/common";

import { hasTier, Tier, tierGateMessage } from "../_dm-shared/vip";

const REQUIRED_TIER = Tier.MAXXER_PLUS;
const VIDEO_ID = "dm-video-bg";

let videoEl: HTMLVideoElement | null = null;
let style: HTMLStyleElement;

function buildCss() {
    const opacity = Math.max(0, Math.min(100, settings.store.opacity)) / 100;
    const blur = Math.max(0, Math.min(40, settings.store.blur));
    return `
        /* Make Discord's main backgrounds transparent so the video shows through. */
        :root, body, [class*="appMount"], [class*="app-"] > [class*="layers"] > [class*="layer"]:first-child {
            background-color: transparent !important;
        }
        body {
            background: transparent !important;
        }
        #${VIDEO_ID} {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            object-fit: cover;
            object-position: center;
            z-index: -1;
            opacity: ${opacity};
            filter: blur(${blur}px);
            pointer-events: none;
            transition: opacity 0.3s ease, filter 0.3s ease;
        }
    `;
}

function ensureVideoEl(): HTMLVideoElement {
    let el = document.getElementById(VIDEO_ID) as HTMLVideoElement | null;
    if (!el) {
        el = document.createElement("video");
        el.id = VIDEO_ID;
        el.autoplay = true;
        el.loop = true;
        el.playsInline = true;
        el.muted = settings.store.mute;
        el.volume = 0.4;
        document.body.prepend(el);
    }
    return el;
}

function applyVideoSettings() {
    if (!videoEl) return;
    const url = settings.store.videoUrl?.trim();
    if (url && videoEl.src !== url) videoEl.src = url;
    videoEl.muted = settings.store.mute;
    videoEl.playbackRate = settings.store.playbackRate;
    if (style) style.textContent = buildCss();
}

function tearDownVideo() {
    if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute("src");
        videoEl.load();
        videoEl.remove();
        videoEl = null;
    }
    if (style) style.textContent = "";
}

function refresh() {
    if (!hasTier(REQUIRED_TIER)) {
        tearDownVideo();
        return;
    }
    if (!settings.store.enable) {
        tearDownVideo();
        return;
    }
    if (!settings.store.videoUrl?.trim()) {
        tearDownVideo();
        return;
    }
    videoEl = ensureVideoEl();
    applyVideoSettings();
    videoEl.play().catch(e => {
        console.warn("[VideoBackground] play() failed:", e);
        Toasts.show({
            message: `Video failed to play — check URL/CORS. ${e?.message ?? ""}`,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: { duration: 4000, position: Toasts.Position.TOP }
        });
    });
}

const settings = definePluginSettings({
    enable: {
        type: OptionType.BOOLEAN,
        description: "🌟 Enable video background (requires MAXXER+ tier)",
        default: false,
        onChange: () => {
            if (settings.store.enable && !hasTier(REQUIRED_TIER)) {
                Toasts.show({
                    message: `🔒 ${tierGateMessage(REQUIRED_TIER)}`,
                    type: Toasts.Type.FAILURE,
                    id: Toasts.genId(),
                    options: { duration: 5000, position: Toasts.Position.TOP }
                });
                settings.store.enable = false;
                return;
            }
            refresh();
        }
    },
    videoUrl: {
        type: OptionType.STRING,
        description:
            "Video URL — http(s):// or vesktop:// asset path. Direct file:// is blocked by Discord's CSP. " +
            "Try hosting your MP4 on a Discord CDN, GitHub raw, or any public HTTPS endpoint.",
        default: "",
        onChange: refresh
    },
    opacity: {
        type: OptionType.SLIDER,
        description: "Opacity (0–100). 30–50 keeps Discord readable on top.",
        default: 35,
        markers: [10, 25, 35, 50, 75, 100],
        onChange: () => {
            if (style) style.textContent = buildCss();
        }
    },
    blur: {
        type: OptionType.SLIDER,
        description: "Blur in pixels (0–40). Higher = softer background, easier on the eyes during heavy chat.",
        default: 0,
        markers: [0, 4, 8, 16, 24, 40],
        onChange: () => {
            if (style) style.textContent = buildCss();
        }
    },
    mute: {
        type: OptionType.BOOLEAN,
        description: "Mute the video (recommended — Discord audio takes priority)",
        default: true,
        onChange: () => {
            if (videoEl) videoEl.muted = settings.store.mute;
        }
    },
    playbackRate: {
        type: OptionType.SLIDER,
        description: "Playback speed",
        default: 1.0,
        markers: [0.25, 0.5, 1.0, 1.5, 2.0],
        onChange: () => {
            if (videoEl) videoEl.playbackRate = settings.store.playbackRate;
        }
    }
});

export default definePlugin({
    name: "VideoBackground",
    description:
        "🌟 MAXXER+ — Plays a video as Discord's background with adjustable opacity and blur. Use any http(s):// MP4 URL. " +
        "Discord stays fully usable on top. Tier-gated; non-MAXXER+ users see the settings but can't activate.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {
        style = createAndAppendStyle("dm-video-background", managedStyleRootNode);
        refresh();
    },

    stop() {
        tearDownVideo();
        style?.remove();
    }
});
