/*
 * Discordmaxxer — performance-mode bridge
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Real CPU/GPU savings for TournamentMode. Three knobs:
 *
 *   1. Process priority — main + renderer dropped to BELOW_NORMAL on Windows
 *      (priority 10 in Node's mapping). Frees scheduling slots for the game.
 *
 *   2. Renderer frame-rate cap — webContents.setFrameRate(30). Halves GPU load
 *      from compositing while in performance mode. Default is 60 (or display
 *      refresh, whichever is lower).
 *
 *   3. arRPC worker — terminate the Rich Presence server worker thread when
 *      perf mode is on. Saves a worker thread + IPC server + game-process
 *      polling overhead. We toggle the user's existing Settings.store.arRPC
 *      flag (saved + restored on toggle off).
 *
 * Cosmetic-only changes (animation strips, badge hiding) live in the
 * TournamentMode plugin's CSS — not here. This file is system-level only,
 * matching the principle: "if it doesn't add lag, leave it on."
 */

import { app, BrowserWindow, webContents } from "electron";
import { setPriority } from "os";

import { IpcEvents } from "../shared/IpcEvents";
import { Settings } from "./settings";
import { handle } from "./utils/ipcWrappers";

// Node's os.setPriority mapping (Windows-mapped):
//   0  = NORMAL          (NORMAL_PRIORITY_CLASS)
//   10 = BELOW_NORMAL    (BELOW_NORMAL_PRIORITY_CLASS)
//   19 = IDLE            (IDLE_PRIORITY_CLASS)
const PRIORITY_BELOW_NORMAL = 10;
const PRIORITY_NORMAL = 0;

const FRAME_RATE_PERF = 30;
const FRAME_RATE_NORMAL = 60;

interface PerfState {
    priorAppliedPriority: number | null;
    priorArRpc: boolean | null;
    on: boolean;
}

const state: PerfState = {
    priorAppliedPriority: null,
    priorArRpc: null,
    on: false
};

function setAllRendererFrameRates(fps: number) {
    let touched = 0;
    for (const wc of webContents.getAllWebContents()) {
        try {
            wc.setFrameRate(fps);
            touched++;
        } catch {
            // some webContents (devtools, internal) reject setFrameRate
        }
    }
    return touched;
}

function trySetProcessPriority(priority: number): boolean {
    try {
        setPriority(0, priority); // 0 = current process
        return true;
    } catch (e) {
        console.warn("[Discordmaxxer] setPriority failed:", (e as Error).message);
        return false;
    }
}

handle(IpcEvents.DM_SET_PERFORMANCE_MODE, (_e, on: boolean) => {
    if (on === state.on) {
        return { priorityChanged: false, frameRateLimited: false, arRpcDisabled: false };
    }

    let priorityChanged = false;
    let frameRateLimited = false;
    let arRpcDisabled = false;

    if (on) {
        // Activate
        priorityChanged = trySetProcessPriority(PRIORITY_BELOW_NORMAL);
        if (priorityChanged) state.priorAppliedPriority = PRIORITY_NORMAL;

        const touched = setAllRendererFrameRates(FRAME_RATE_PERF);
        frameRateLimited = touched > 0;

        if (Settings.store.arRPC === true) {
            state.priorArRpc = true;
            Settings.store.arRPC = false; // change-listener in arrpc/index.ts handles teardown
            arRpcDisabled = true;
        } else {
            state.priorArRpc = false;
        }

        state.on = true;
        console.log(`[Discordmaxxer] PerfMode ON — priority=${priorityChanged} fps=${frameRateLimited} arRpc=${arRpcDisabled}`);
    } else {
        // Deactivate — restore prior state
        if (state.priorAppliedPriority !== null) {
            priorityChanged = trySetProcessPriority(state.priorAppliedPriority);
            state.priorAppliedPriority = null;
        }

        const touched = setAllRendererFrameRates(FRAME_RATE_NORMAL);
        frameRateLimited = touched > 0;

        if (state.priorArRpc === true) {
            Settings.store.arRPC = true; // change-listener restarts the worker
            arRpcDisabled = true; // semantics: "we touched arRpc"
        }
        state.priorArRpc = null;

        state.on = false;
        console.log(`[Discordmaxxer] PerfMode OFF — restored`);
    }

    return { priorityChanged, frameRateLimited, arRpcDisabled };
});

// Apply current frame rate cap to any new BrowserWindow that comes online
// while perf mode is on (prevents an unfocus → new-window opening from
// resetting back to 60).
app.on("browser-window-created", (_e, win: BrowserWindow) => {
    if (!state.on) return;
    try {
        win.webContents.setFrameRate(FRAME_RATE_PERF);
    } catch {
        // ignore
    }
});
