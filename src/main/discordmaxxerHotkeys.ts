/*
 * Discordmaxxer — global hotkey bridge
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * OS-level hotkey registration via Electron's globalShortcut. Keyed by a
 * caller-supplied id so multiple plugins can register their own shortcuts.
 * When fired, posts an event to the renderer with the matching id; plugins
 * listen for their id and toggle accordingly.
 */

import { app, globalShortcut } from "electron";

import { IpcEvents } from "../shared/IpcEvents";
import { mainWin } from "./mainWindow";
import { handle } from "./utils/ipcWrappers";

// id → accelerator. Keep so we can unregister cleanly on app quit.
const registered = new Map<string, string>();

// Convert "ctrl+alt+t" to Electron's "CommandOrControl+Alt+T"
function toElectronAccelerator(human: string): string {
    return human
        .toLowerCase()
        .split("+")
        .map(p => p.trim())
        .map(p => {
            if (p === "ctrl" || p === "control") return "CommandOrControl";
            if (p === "alt") return "Alt";
            if (p === "shift") return "Shift";
            if (p === "meta" || p === "cmd" || p === "win") return "Super";
            return p.length === 1 ? p.toUpperCase() : p;
        })
        .join("+");
}

handle(IpcEvents.DM_REGISTER_GLOBAL_HOTKEY, (_e, id: string, hotkey: string) => {
    // Drop existing registration for this id if any.
    const existing = registered.get(id);
    if (existing) globalShortcut.unregister(existing);

    const accelerator = toElectronAccelerator(hotkey);
    const ok = globalShortcut.register(accelerator, () => {
        mainWin?.webContents.send(IpcEvents.DM_GLOBAL_HOTKEY_FIRED, id);
    });

    if (ok) {
        registered.set(id, accelerator);
        console.log(`[Discordmaxxer] Registered global hotkey '${accelerator}' for ${id}`);
    } else {
        registered.delete(id);
        console.warn(`[Discordmaxxer] Failed to register global hotkey '${accelerator}' for ${id} (likely conflict)`);
    }
    return ok;
});

handle(IpcEvents.DM_UNREGISTER_GLOBAL_HOTKEY, (_e, id: string) => {
    const accelerator = registered.get(id);
    if (!accelerator) return false;
    globalShortcut.unregister(accelerator);
    registered.delete(id);
    return true;
});

app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    registered.clear();
});
