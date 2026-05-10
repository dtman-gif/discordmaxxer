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
import { Button, React, Toasts } from "@webpack/common";

import { getMyTier, hasTier, Tier, TIER_LABELS, tierGateMessage } from "../_dm-shared/vip";

const REQUIRED_TIER = Tier.MAXXER_PLUS;
const VIDEO_ID = "dm-video-bg";

// Saved video bg slots — persisted in localStorage as JSON. Tier-gated max:
//   FREE = 1 (funnel: gives a taste, friction to swap pushes upgrade)
//   MAXXER = 5 · MAXXER+ = 20 · MAXXER++ = unlimited
// Local file uploads (blob: URLs) stay runtime-only — those are scratchpad
// content, can't survive relaunch anyway, so they don't count toward slots.
const SLOTS_KEY = "dm-video-bg-slots";

interface SavedSlot {
    id: string;
    name: string;
    url: string;
    opacity?: number;
    blur?: number;
    sidebarOpacity?: number;
    savedAt: number;
}

function tierSlotCap(tier: Tier): number {
    switch (tier) {
        case Tier.MAXXER_PLUS_PLUS: return Infinity;
        case Tier.MAXXER_PLUS: return 20;
        case Tier.MAXXER: return 5;
        default: return 1;
    }
}

function readSlots(): SavedSlot[] {
    try {
        const raw = localStorage.getItem(SLOTS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.filter(s => s && typeof s.id === "string" && typeof s.url === "string" && s.url.length > 0);
    } catch {
        return [];
    }
}

function writeSlots(slots: SavedSlot[]): void {
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slots)); }
    catch (e) { console.warn("[VideoBackground] writeSlots failed:", e); }
}

function newSlotId(): string {
    return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function toast(message: string, type: any = Toasts.Type.MESSAGE, durationMs = 3000) {
    Toasts.show({
        message, type,
        id: Toasts.genId(),
        options: { duration: durationMs, position: Toasts.Position.TOP }
    });
}

function SavedSlotsPanel() {
    const [slots, setSlots] = React.useState<SavedSlot[]>(() => readSlots());
    const [name, setName] = React.useState("");

    const tier = getMyTier();
    const cap = tierSlotCap(tier);
    const capLabel = cap === Infinity ? "unlimited" : `${cap}`;
    const tierName = TIER_LABELS[tier];
    const atCap = slots.length >= cap;

    const persist = (next: SavedSlot[]) => {
        writeSlots(next);
        setSlots(next);
    };

    const onSaveCurrent = () => {
        const url = (settings.store.videoUrl ?? "").trim();
        if (!url || !/^https?:\/\//i.test(url)) {
            toast("Set a https:// video URL above before saving (local file uploads can't be saved to slots).", Toasts.Type.FAILURE);
            return;
        }
        if (atCap) {
            toast(`Slot cap reached (${cap}). Delete a slot or upgrade — current tier ${tierName}.`, Toasts.Type.FAILURE, 5000);
            return;
        }
        const slot: SavedSlot = {
            id: newSlotId(),
            name: name.trim() || `Background ${slots.length + 1}`,
            url,
            opacity: settings.store.opacity,
            blur: settings.store.blur,
            sidebarOpacity: settings.store.sidebarOpacity,
            savedAt: Date.now()
        };
        persist([...slots, slot]);
        setName("");
        toast(`💾 Saved "${slot.name}" — ${slots.length + 1}/${capLabel}`, Toasts.Type.SUCCESS);
    };

    const onLoad = (slot: SavedSlot) => {
        if (localBlobUrl) {
            URL.revokeObjectURL(localBlobUrl);
            localBlobUrl = null;
        }
        settings.store.videoUrl = slot.url;
        if (typeof slot.opacity === "number") settings.store.opacity = slot.opacity;
        if (typeof slot.blur === "number") settings.store.blur = slot.blur;
        if (typeof slot.sidebarOpacity === "number") settings.store.sidebarOpacity = slot.sidebarOpacity;
        if (!settings.store.enable) settings.store.enable = true;
        refresh();
        toast(`▶ Playing "${slot.name}"`, Toasts.Type.SUCCESS);
    };

    const onDelete = (id: string) => {
        const slot = slots.find(s => s.id === id);
        persist(slots.filter(s => s.id !== id));
        if (slot) toast(`🗑 Deleted "${slot.name}"`, Toasts.Type.MESSAGE);
    };

    const wrapStyle: React.CSSProperties = {
        marginTop: 12,
        padding: "12px 14px",
        background: "rgba(226, 91, 255, 0.05)",
        border: "1px solid rgba(226, 91, 255, 0.25)",
        borderRadius: 8
    };
    const headerStyle: React.CSSProperties = {
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 10, flexWrap: "wrap", gap: 6
    };
    const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#fbefff", letterSpacing: 0.2 };
    const counterStyle: React.CSSProperties = {
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: 11,
        padding: "3px 8px",
        borderRadius: 999,
        background: atCap ? "rgba(255, 85, 85, 0.18)" : "rgba(85, 255, 255, 0.14)",
        color: atCap ? "#ff8a8a" : "#9be7ff",
        border: `1px solid ${atCap ? "rgba(255,85,85,0.3)" : "rgba(85,255,255,0.25)"}`
    };
    const inputStyle: React.CSSProperties = {
        flex: 1,
        minWidth: 140,
        padding: "7px 10px",
        borderRadius: 6,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(0,0,0,0.3)",
        color: "#fff",
        fontSize: 12.5
    };
    const slotRow: React.CSSProperties = {
        display: "flex", alignItems: "center", gap: 8,
        padding: "6px 8px", marginTop: 4,
        background: "rgba(0,0,0,0.22)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6
    };
    const slotName: React.CSSProperties = { flex: 1, fontSize: 12.5, color: "#dde2ee", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
    const slotUrl: React.CSSProperties = { fontSize: 10.5, color: "#8a91a3", fontFamily: "ui-monospace,Menlo,Consolas,monospace", marginLeft: 8 };

    return (
        <div style={wrapStyle}>
            <div style={headerStyle}>
                <div style={titleStyle}>💾 Saved video backgrounds</div>
                <div style={counterStyle}>{slots.length} / {capLabel} · {tierName}</div>
            </div>
            {!hasTier(REQUIRED_TIER) && (
                <div style={{ fontSize: 11.5, color: "#cbd0e0", marginBottom: 8, opacity: 0.85 }}>
                    Saving is available at every tier (FREE saves 1). The video bg <em>feature</em> needs MAXXER+ to actually play — see settings above.
                </div>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input
                    type="text"
                    placeholder="Optional slot name (e.g. 'rainy night')"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") onSaveCurrent(); }}
                    style={inputStyle}
                    spellCheck={false}
                />
                <Button size={Button.Sizes.SMALL} color={Button.Colors.BRAND} onClick={onSaveCurrent} disabled={atCap}>
                    💾 Save current URL
                </Button>
            </div>
            {slots.length === 0 ? (
                <div style={{ fontSize: 11.5, color: "#8a91a3", marginTop: 10, fontStyle: "italic" }}>
                    No saved slots yet. Paste a URL in the field above, optionally name it, then hit Save.
                </div>
            ) : (
                <div style={{ marginTop: 8 }}>
                    {slots.map(slot => (
                        <div key={slot.id} style={slotRow}>
                            <span style={slotName} title={slot.url}>
                                {slot.name}
                                <span style={slotUrl}>{(() => {
                                    try { return new URL(slot.url).host; } catch { return slot.url.slice(0, 30); }
                                })()}</span>
                            </span>
                            <Button size={Button.Sizes.MIN} color={Button.Colors.GREEN} onClick={() => onLoad(slot)}>
                                ▶ Load
                            </Button>
                            <Button size={Button.Sizes.MIN} color={Button.Colors.RED} onClick={() => onDelete(slot.id)}>
                                ✕
                            </Button>
                        </div>
                    ))}
                </div>
            )}
            {atCap && cap !== Infinity && (
                <div style={{ fontSize: 11.5, color: "#ff8a8a", marginTop: 8 }}>
                    🔒 Slot cap reached. Delete a saved slot, or upgrade for more (MAXXER 5 · MAXXER+ 20 · MAXXER++ unlimited).
                </div>
            )}
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
    savedSlots: {
        type: OptionType.COMPONENT,
        description: "",
        component: SavedSlotsPanel
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
