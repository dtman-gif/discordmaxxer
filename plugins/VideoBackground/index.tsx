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
 * Sources: http(s):// URL field, OR an "Upload local video" button that uses
 * URL.createObjectURL on a user-picked file (blob: URLs satisfy Discord's CSP).
 * Local picks are runtime-only — not persisted across reloads.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { Button, Toasts } from "@webpack/common";

import { hasTier, Tier, tierGateMessage } from "../_dm-shared/vip";

const REQUIRED_TIER = Tier.MAXXER_PLUS;
const VIDEO_ID = "dm-video-bg";

// Public test video — known-good HTTPS source, ~1MB MP4.
const SAMPLE_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

let videoEl: HTMLVideoElement | null = null;
let style: HTMLStyleElement;
// Runtime-only blob URL when the user picks a local file. NOT persisted.
let localBlobUrl: string | null = null;

function buildCss() {
    const opacity = Math.max(0, Math.min(100, settings.store.opacity)) / 100;
    const blur = Math.max(0, Math.min(40, settings.store.blur));
    const sidebarAlpha = Math.max(0, Math.min(100, settings.store.sidebarOpacity)) / 100;
    return `
        /* Override Discord's themed background CSS variables so the chat
           area shows the video through. Sidebars stay semi-opaque (driven
           by sidebarOpacity setting) for text readability. */
        :root,
        .theme-dark,
        .theme-light,
        .theme-darker,
        .visual-refresh {
            --background-primary: transparent !important;
            --bg-overlay-chat: transparent !important;
            --bg-overlay-app-frame: transparent !important;
            --bg-base-primary: transparent !important;
            --bg-base-secondary: rgba(0, 0, 0, ${sidebarAlpha * 0.6}) !important;
            --bg-base-tertiary: rgba(0, 0, 0, ${sidebarAlpha * 0.7}) !important;
            --background-secondary: rgba(0, 0, 0, ${sidebarAlpha * 0.55}) !important;
            --background-secondary-alt: rgba(0, 0, 0, ${sidebarAlpha * 0.65}) !important;
            --background-tertiary: rgba(0, 0, 0, ${sidebarAlpha * 0.7}) !important;
            --background-floating: rgba(0, 0, 0, ${sidebarAlpha * 0.85}) !important;
            --bg-overlay-3: rgba(0, 0, 0, ${sidebarAlpha * 0.4}) !important;
            --bg-overlay-floating: rgba(0, 0, 0, ${sidebarAlpha * 0.85}) !important;
        }

        /* Class-selector fallback for the structural divs Discord paints
           backgrounds on directly (in case a future Discord update stops
           honoring the variables in some places). */
        body,
        html,
        [class^="appMount"],
        [class*=" appMount"],
        [class^="app-"],
        [class*=" app-"],
        [class^="layers"],
        [class*=" layers"],
        [class^="layer"]:first-child,
        [class*=" layer"]:first-child,
        [class^="bg-"],
        [class*=" bg-"],
        [class*="container"][class*="root"],
        [class*="base-"][class*="base"],
        [class^="chat"][class*="chat"] > [class*="content"],
        [class*="chatContent"] {
            background: transparent !important;
            background-color: transparent !important;
            background-image: none !important;
        }

        #${VIDEO_ID} {
            position: fixed;
            inset: 0;
            width: 100vw;
            height: 100vh;
            object-fit: cover;
            object-position: center;
            /* z-index 0 + position: fixed puts the video at the bottom of
               its stacking context; Discord's chrome (z-index: auto / >0)
               paints over it. Using 0 instead of -1 because some Discord
               wrappers create stacking contexts that hide negative z-index
               children entirely. */
            z-index: 0;
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

function activeUrl(): string {
    // Local pick wins over typed URL when present
    if (localBlobUrl) return localBlobUrl;
    return settings.store.videoUrl?.trim() ?? "";
}

function applyVideoSettings() {
    if (!videoEl) return;
    const url = activeUrl();
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
        console.log("[VideoBackground] refresh: tier check failed (need MAXXER+, got tier from claim cache or hardcoded list)");
        tearDownVideo();
        return;
    }
    if (!settings.store.enable) {
        console.log("[VideoBackground] refresh: plugin disabled in settings");
        tearDownVideo();
        return;
    }
    const url = activeUrl();
    if (!url) {
        console.log("[VideoBackground] refresh: no video URL or local file picked");
        tearDownVideo();
        return;
    }
    videoEl = ensureVideoEl();
    console.log("[VideoBackground] refresh: video element in DOM, src =", url.slice(0, 80));
    applyVideoSettings();

    // Surface the load lifecycle so the user can tell from devtools console
    // whether the video resource itself fails (CSP / CORS / 404 / format).
    videoEl.onloadeddata = () => console.log("[VideoBackground] loadeddata — video has frames");
    videoEl.onerror = () => {
        const code = videoEl?.error?.code;
        const msg = videoEl?.error?.message ?? "unknown";
        const codeLabels: Record<number, string> = {
            1: "MEDIA_ERR_ABORTED",
            2: "MEDIA_ERR_NETWORK (CSP/CORS/404)",
            3: "MEDIA_ERR_DECODE (codec)",
            4: "MEDIA_ERR_SRC_NOT_SUPPORTED (format/CSP)"
        };
        console.warn(`[VideoBackground] error ${code} (${codeLabels[code ?? -1] ?? "?"}):`, msg);
        Toasts.show({
            message: `Video failed: ${codeLabels[code ?? -1] ?? "unknown"}. Open devtools (Ctrl+Shift+I) for details.`,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: { duration: 6000, position: Toasts.Position.TOP }
        });
    };

    videoEl.play().then(() => {
        console.log("[VideoBackground] play() resolved — video is playing");
    }).catch(e => {
        console.warn("[VideoBackground] play() rejected:", e);
        Toasts.show({
            message: `Play blocked — try toggling the plugin off+on once. ${e?.message ?? ""}`,
            type: Toasts.Type.FAILURE,
            id: Toasts.genId(),
            options: { duration: 4000, position: Toasts.Position.TOP }
        });
    });
}

function pickLocalFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*";
    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
        localBlobUrl = URL.createObjectURL(file);
        Toasts.show({
            message: `🎬 Loaded local video: ${file.name} (${(file.size / 1_048_576).toFixed(1)} MB)`,
            type: Toasts.Type.SUCCESS,
            id: Toasts.genId(),
            options: { duration: 3000, position: Toasts.Position.TOP }
        });
        if (!settings.store.enable) settings.store.enable = true;
        refresh();
    };
    input.click();
}

function clearLocalFile() {
    if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
        localBlobUrl = null;
    }
    refresh();
}

function VideoControls() {
    return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <Button onClick={pickLocalFile} size={Button.Sizes.SMALL}>
                📁 Upload local video
            </Button>
            <Button onClick={clearLocalFile} size={Button.Sizes.SMALL} color={Button.Colors.RED}>
                ✕ Clear upload
            </Button>
            <Button
                size={Button.Sizes.SMALL}
                color={Button.Colors.GREEN}
                onClick={() => {
                    if (localBlobUrl) {
                        URL.revokeObjectURL(localBlobUrl);
                        localBlobUrl = null;
                    }
                    settings.store.videoUrl = SAMPLE_VIDEO_URL;
                    if (!settings.store.enable) settings.store.enable = true;
                    refresh();
                    Toasts.show({
                        message: "🎬 Sample video applied — Big Buck Bunny",
                        type: Toasts.Type.SUCCESS,
                        id: Toasts.genId(),
                        options: { duration: 3000, position: Toasts.Position.TOP }
                    });
                }}
            >
                🎬 Test with sample
            </Button>
        </div>
    );
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
            "Video URL — http(s):// path. Or use the 'Upload local video' button below to play a file off your disk (kept in memory only, not persisted).",
        default: "",
        onChange: refresh
    },
    videoControls: {
        type: OptionType.COMPONENT,
        description: "",
        component: VideoControls
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
    sidebarOpacity: {
        type: OptionType.SLIDER,
        description:
            "Sidebar / chat-list darkness (0–100). 0 = fully transparent (video shows everywhere), 100 = stock Discord opaque chrome. ~70 keeps text readable.",
        default: 70,
        markers: [0, 25, 50, 70, 100],
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
        if (localBlobUrl) {
            URL.revokeObjectURL(localBlobUrl);
            localBlobUrl = null;
        }
        style?.remove();
    }
});
