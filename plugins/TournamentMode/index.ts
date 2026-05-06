/*
 * Discordmaxxer — TournamentMode plugin
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Toggleable low-distraction mode for competitive gaming. Kills animations,
 * hides unread badges, mutes visual noise. Hotkey-driven.
 *
 * v2: OS-level global hotkey (default-on) via Discordmaxxer's globalShortcut
 * bridge. Falls back to window-focused keydown if global registration fails
 * or is disabled in settings.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { Toasts } from "@webpack/common";

const HOTKEY_ID = "discordmaxxer.TournamentMode";

let style: HTMLStyleElement;
let active = false;
let hotkeyHandler: ((e: KeyboardEvent) => void) | null = null;
let globalRegistered = false;

const TOURNAMENT_CSS = `
    /* Discordmaxxer TournamentMode */
    *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
    }
    [class*="unread"] [class*="badge"],
    [class*="numberBadge"],
    [class*="mentionsCountBadge"],
    [class*="typing-"] {
        display: none !important;
    }
    [class*="emoji"] img,
    [class*="emoji"] video {
        animation-play-state: paused !important;
    }
`;

const settings = definePluginSettings({
    hotkey: {
        type: OptionType.STRING,
        description: "Hotkey to toggle (format: ctrl+alt+t). Works system-wide when 'Use OS-level hotkey' is on.",
        default: "ctrl+alt+t"
    },
    useGlobalHotkey: {
        type: OptionType.BOOLEAN,
        description: "Use OS-level hotkey (fires while you're in a game with Discord unfocused). Recommended ON for competitive use.",
        default: true
    },
    enabledOnStart: {
        type: OptionType.BOOLEAN,
        description: "Enable Tournament Mode automatically on Discord launch",
        default: false
    }
});

interface ParsedHotkey {
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    key: string;
}

function parseHotkey(hk: string): ParsedHotkey {
    const parts = hk.toLowerCase().split("+").map(s => s.trim());
    return {
        ctrl: parts.includes("ctrl"),
        alt: parts.includes("alt"),
        shift: parts.includes("shift"),
        key: parts[parts.length - 1] ?? ""
    };
}

function setActive(next: boolean) {
    active = next;
    if (style) style.textContent = active ? TOURNAMENT_CSS : "";
    console.log(`[TournamentMode] ${active ? "ACTIVE" : "off"}`);

    Toasts.show({
        message: active ? "🎮 Tournament Mode: ON" : "Tournament Mode: OFF",
        type: active ? Toasts.Type.SUCCESS : Toasts.Type.MESSAGE,
        id: Toasts.genId(),
        options: {
            duration: 1500,
            position: Toasts.Position.TOP
        }
    });
}

export default definePlugin({
    name: "TournamentMode",
    description: "Press Ctrl+Alt+T (configurable below) to TOGGLE a low-distraction mode for competitive gaming — kills animations, hides badges. The toggle here just enables the hotkey listener; the mode itself activates when you press the hotkey. Toast shows current state.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    async start() {
        style = createAndAppendStyle("dm-tournament-mode", managedStyleRootNode);

        if (settings.store.enabledOnStart) setActive(true);

        const native = (globalThis as any).VesktopNative;
        const wantGlobal = settings.store.useGlobalHotkey && native?.globalHotkey?.register;

        if (wantGlobal) {
            try {
                const ok = await native.globalHotkey.register(HOTKEY_ID, settings.store.hotkey, () => {
                    setActive(!active);
                });
                if (ok) {
                    globalRegistered = true;
                    console.log("[TournamentMode] OS-level hotkey registered");
                    return; // skip window-focused fallback
                }
                console.warn("[TournamentMode] OS-level register failed (likely conflict) — falling back to window-focused");
            } catch (e) {
                console.warn("[TournamentMode] OS-level register threw, falling back:", e);
            }
        }

        // Fallback: window-focused listener (works only when Discord has focus).
        const hk = parseHotkey(settings.store.hotkey);
        hotkeyHandler = (e: KeyboardEvent) => {
            if (
                e.ctrlKey === hk.ctrl &&
                e.altKey === hk.alt &&
                e.shiftKey === hk.shift &&
                e.key.toLowerCase() === hk.key
            ) {
                e.preventDefault();
                e.stopPropagation();
                setActive(!active);
            }
        };
        window.addEventListener("keydown", hotkeyHandler, true);
    },

    stop() {
        if (globalRegistered) {
            (globalThis as any).VesktopNative?.globalHotkey?.unregister?.(HOTKEY_ID);
            globalRegistered = false;
        }
        if (hotkeyHandler) {
            window.removeEventListener("keydown", hotkeyHandler, true);
            hotkeyHandler = null;
        }
        style?.remove();
        active = false;
    }
});
