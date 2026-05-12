/*
 * Discordmaxxer — Hub plugin (clickable quick-access panel, in-toolbar)
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Injects a DM button into Discord's user-panel toolbar (next to your
 * username, before the mic icon). Click opens a panel with VIP tier badge,
 * VIP features section, and quick toggles for our custom plugins.
 *
 * Toggle UX: writes the Vencord setting AND re-runs the plugin's start/stop
 * so that onChange-style side effects (like CSS injection) actually take
 * effect immediately, not just persist to disk.
 */

import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import definePlugin from "@utils/types";

import { getMyTier, hasTier, Tier, TIER_LABELS } from "../_dm-shared/vip";

const FAB_ID = "dm-hub-fab";
const PANEL_ID = "dm-hub-panel";
const PANEL_ROOT_ID = "dm-hub-panel-root";

// Horror-Clyde mark, NO bullet holes — Variant B (cream body, black outline,
// red eyes, devil horns, speech-tail). Same source as build/tray-source.png.
// Used at 26x26 in the FAB toolbar button (next to the mic mute) AND at 14x14
// in the panel header. v0.7.22 (2026-05-12): swapped from the bullet-holes
// mark to the no-holes Variant B for consistency with v0.7.20's shortcut-icon
// change — bullet-holes mark survives at 256px+ but reads as noise on small
// chrome surfaces (taskbar 32px, FAB 26px). Branded-art renders still use the
// bullet-holes version (build/icon-source.png).
//
// REVERT RECIPE: if Diggy wants the bullet-holes mark back here, the old
// base64 lives in git history at commit 3453308 (v0.7.20) and earlier — the
// declaration starts with `iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAMAAADVRocK` for
// the holes version vs `iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4` for the
// no-holes version below. `git show 3453308:plugins/DMHub/index.ts | grep -A1 FAB_LOGO_DATA`
// pulls it out.
const FAB_LOGO_DATA =
    "data:image/png;base64,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";

let panelRoot: HTMLDivElement | null = null;
let style: HTMLStyleElement;
let observer: MutationObserver | null = null;

const HUB_CSS = `
    /* Toolbar button — renders the locked primary v1 mark on a transparent
       background so the actual Discordmaxxer logo shows (not a colored chip).
       Hover glow tints with the active theme via --brand-experiment. */
    #${FAB_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        margin: 0 2px;
        padding: 0;
        border-radius: 50%;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: filter 0.15s, box-shadow 0.15s, transform 0.15s;
    }
    #${FAB_ID}:hover {
        filter: brightness(1.08);
        transform: scale(1.06);
        box-shadow: 0 0 12px var(--brand-experiment-30a, rgba(226,91,255,0.45));
    }

    /* Floating panel anchored bottom-left, above user panel */
    #${PANEL_ROOT_ID} {
        position: fixed;
        left: 12px;
        bottom: 64px;
        z-index: 999999;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    #${PANEL_ROOT_ID}.hidden {
        display: none;
    }
    #${PANEL_ID} {
        width: 320px;
        background: linear-gradient(160deg, #110a20, #1a0a2e);
        border: 1px solid rgba(226,91,255,0.4);
        border-radius: 14px;
        padding: 14px 14px 12px;
        color: #fbefff;
        box-shadow: 0 14px 40px rgba(0,0,0,0.55), 0 0 30px rgba(226,91,255,0.2);
        backdrop-filter: blur(16px);
        max-height: calc(100vh - 200px);
        overflow-y: auto;
    }
    .dm-hub-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
    }
    .dm-hub-title { font-weight: 700; font-size: 15px; }
    .dm-hub-tier {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 8px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        background: linear-gradient(135deg, #e25bff, #4c51f7);
        color: #fbefff;
        margin-bottom: 10px;
    }
    .dm-hub-tier.free {
        background: rgba(139,106,173,0.3);
        color: #ddb1ff;
    }
    .dm-hub-section {
        margin-top: 10px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 1px;
        color: #ddb1ff;
        text-transform: uppercase;
        opacity: 0.7;
    }
    .dm-hub-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        margin: 4px 0;
        background: rgba(42,9,95,0.4);
        border: 1px solid rgba(226,91,255,0.18);
        border-radius: 8px;
        font-size: 13px;
    }
    .dm-hub-row.vip {
        border-color: rgba(243,175,25,0.45);
        background: linear-gradient(135deg, rgba(243,175,25,0.08), rgba(226,91,255,0.08));
    }
    .dm-hub-row-label {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .dm-hub-row-tag {
        font-size: 9px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(243,175,25,0.25);
        color: #f3af19;
        font-weight: 700;
        letter-spacing: 0.4px;
    }
    .dm-hub-toggle {
        width: 36px;
        height: 20px;
        border-radius: 10px;
        background: rgba(255,255,255,0.1);
        position: relative;
        cursor: pointer;
        transition: background 0.15s;
        flex-shrink: 0;
    }
    .dm-hub-toggle.on { background: linear-gradient(135deg, #e25bff, #4c51f7); }
    .dm-hub-toggle::after {
        content: "";
        position: absolute;
        top: 2px;
        left: 2px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fbefff;
        transition: left 0.15s;
    }
    .dm-hub-toggle.on::after { left: 18px; }
    .dm-hub-toggle.locked { opacity: 0.4; cursor: not-allowed; }
    .dm-hub-mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        margin-right: 8px;
        background: linear-gradient(135deg, var(--brand-experiment, #e25bff), var(--brand-experiment-700, #4c51f7));
        border-radius: 5px;
        vertical-align: middle;
        cursor: help;
        transition: transform 0.18s, box-shadow 0.18s;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.18) inset;
    }
    .dm-hub-mark:hover {
        transform: scale(1.12) rotate(-3deg);
        box-shadow: 0 0 0 1px rgba(255,255,255,0.3) inset, 0 0 14px var(--brand-experiment-30a, rgba(226,91,255,0.7));
    }
    .dm-hub-mark svg, .dm-hub-mark img { display: block; }
    .dm-hub-action-btn {
        background: linear-gradient(135deg, rgba(226,91,255,0.25), rgba(76,81,247,0.25));
        color: #fbefff;
        border: 1px solid rgba(226,91,255,0.45);
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: filter 0.12s;
    }
    .dm-hub-action-btn:hover { filter: brightness(1.2); }
    .dm-hub-info {
        font-size: 11px;
        color: #ddb1ff;
        opacity: 0.8;
        margin: 6px 0;
        line-height: 1.4;
    }
    /* When a note immediately follows a row, bind it visually to that row
     * (left-border + tight margins + indent) so it can't be mistaken for a
     * section header that applies to subsequent rows. */
    .dm-hub-row + .dm-hub-info {
        margin: -2px 10px 4px 10px;
        padding: 2px 0 2px 8px;
        border-left: 2px solid rgba(226,91,255,0.4);
        opacity: 0.75;
    }
    .dm-hub-footer {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid rgba(226,91,255,0.18);
        font-size: 11px;
        color: #8b6aad;
        text-align: center;
    }
    .dm-hub-close {
        background: transparent;
        border: none;
        color: #ddb1ff;
        cursor: pointer;
        font-size: 16px;
        padding: 0 4px;
    }
`;

interface QuickToggle {
    plugin: string;
    label: string;
    settingKey?: string;
    minTier?: Tier;
    note?: string;
    /** When true, skip the plugin restart on toggle (the setting's onChange
     *  handles runtime state cleanly without needing a full stop/start
     *  cycle). Used for live-state mirrors like TM/CompactView's
     *  manuallyActive — restarting them would re-register hotkeys, which is
     *  expensive + visible (toast spam). */
    noRestart?: boolean;
}

const QUICK_TOGGLES: QuickToggle[] = [
    { plugin: "VideoBackground", label: "🌟 Video Background", settingKey: "enable", minTier: Tier.MAXXER_PLUS, note: "Set URL in Discordmaxxer plugin settings" },
    { plugin: "DMTheme", label: "🎨 Maxxer Theme", settingKey: "enable" },
    { plugin: "TournamentMode", label: "🎮 Tournament Mode", settingKey: "manuallyActive", note: "Or press Ctrl+Alt+T", noRestart: true },
    { plugin: "CompactView", label: "📐 Compact View", settingKey: "manuallyActive", note: "Or press Ctrl+Alt+H", noRestart: true },
    { plugin: "MassDelete", label: "🗑️ Mass-Delete menu", settingKey: "enableContextMenu", note: "OPT-IN — TOS risk" },
    { plugin: "DMBadge", label: "💎 Profile Badge", settingKey: "showOnOwnProfile" },
    { plugin: "DMStreamMute", label: "🔇 Mute screenshare audio", settingKey: "muted", note: "Or press Ctrl+Shift+M", noRestart: true }
];

function vencord(): any {
    return (globalThis as any).Vencord;
}

function isPluginEnabled(name: string): boolean {
    return !!vencord()?.PlainSettings?.plugins?.[name]?.enabled;
}

function getSetting(plugin: string, key: string): boolean {
    return !!vencord()?.PlainSettings?.plugins?.[plugin]?.[key];
}

function setSetting(plugin: string, key: string, value: boolean, noRestart?: boolean) {
    const v = vencord();
    if (!v?.Settings?.plugins?.[plugin]) return;

    // 1) Persist the value through Vencord's settings proxy.
    v.Settings.plugins[plugin][key] = value;

    // 2) noRestart: setting's onChange handles runtime state cleanly (e.g.,
    //    TournamentMode's manuallyActive flips active+CSS without needing
    //    a full plugin re-init). Skip the heavy restart in that case.
    if (noRestart) return;

    // 3) Otherwise re-init the plugin so its start() reads the new value and
    //    onChange-style side effects (CSS injection, badge re-registration,
    //    hotkey re-binding) actually take effect.
    const pluginObj = v.Plugins?.plugins?.[plugin];
    if (!pluginObj) return;

    try {
        v.Plugins.stopPlugin?.(pluginObj);
    } catch (e) {
        console.warn(`[DiscordmaxxerHub] stopPlugin(${plugin}) threw:`, e);
    }
    try {
        v.Plugins.startPlugin?.(pluginObj);
    } catch (e) {
        console.warn(`[DiscordmaxxerHub] startPlugin(${plugin}) threw:`, e);
    }
}

function renderPanelHTML(): string {
    const tier = getMyTier();
    const tierLabel = TIER_LABELS[tier];
    const tierClass = tier === Tier.FREE ? "free" : "";

    const rows = QUICK_TOGGLES.map(t => {
        if (!isPluginEnabled(t.plugin)) {
            return `<div class="dm-hub-row" style="opacity:0.5">
                <div class="dm-hub-row-label">${t.label}</div>
                <span style="font-size:10px;color:#8b6aad">disabled</span>
            </div>`;
        }
        if (t.minTier && !hasTier(t.minTier)) {
            return `<div class="dm-hub-row vip">
                <div class="dm-hub-row-label">${t.label}<span class="dm-hub-row-tag">${TIER_LABELS[t.minTier]}</span></div>
                <div class="dm-hub-toggle locked" data-locked="true"></div>
            </div>`;
        }
        if (!t.settingKey) {
            return `<div class="dm-hub-row">
                <div class="dm-hub-row-label">${t.label}</div>
                <span style="font-size:10px;color:#8b6aad">hotkey</span>
            </div>`;
        }
        const on = getSetting(t.plugin, t.settingKey);
        const tag = t.minTier ? `<span class="dm-hub-row-tag">${TIER_LABELS[t.minTier]}</span>` : "";
        const note = t.note ? `<div class="dm-hub-info">${t.note}</div>` : "";
        return `<div class="dm-hub-row${t.minTier ? " vip" : ""}">
            <div class="dm-hub-row-label">${t.label}${tag}</div>
            <div class="dm-hub-toggle ${on ? "on" : ""}" data-plugin="${t.plugin}" data-key="${t.settingKey}"></div>
        </div>${note}`;
    }).join("");

    return `<div id="${PANEL_ID}">
        <div class="dm-hub-header">
            <div class="dm-hub-title"><span class="dm-hub-mark" title="Discordmaxxer — Discord, optimized"><img src="${FAB_LOGO_DATA}" width="14" height="14" alt=""/></span> Discordmaxxer</div>
            <button class="dm-hub-close" data-action="close" title="Close">×</button>
        </div>
        <div class="dm-hub-tier ${tierClass}">${tierLabel}</div>
        ${tier === Tier.FREE
            ? `<div class="dm-hub-info">⭐ Upgrade to MAXXER+ for video backgrounds and premium themes.</div>`
            : `<div class="dm-hub-info">Welcome back, ${tierLabel}.</div>`}
        <div class="dm-hub-section">Quick toggles</div>
        ${rows}
        <div class="dm-hub-section">Maintenance</div>
        <div class="dm-hub-row">
            <div class="dm-hub-row-label">♻️ Reload Discord (frees RAM)</div>
            <button class="dm-hub-action-btn" data-action="reload-renderer">Reload</button>
        </div>
        <div class="dm-hub-info">Use this if Discord starts feeling sluggish after hours of uptime. Login state survives.</div>
        <div class="dm-hub-footer">Full settings → Discord settings → Discordmaxxer → Plugins</div>
    </div>`;
}

function ensurePanelRoot() {
    if (panelRoot) return;
    panelRoot = document.createElement("div");
    panelRoot.id = PANEL_ROOT_ID;
    panelRoot.classList.add("hidden");
    document.body.appendChild(panelRoot);

    panelRoot.addEventListener("click", (e: any) => {
        const t = e.target as HTMLElement;
        if (t.dataset.action === "close") {
            panelRoot!.classList.add("hidden");
            return;
        }
        if (t.dataset.action === "reload-renderer") {
            panelRoot!.classList.add("hidden");
            location.reload();
            return;
        }
        if (t.classList.contains("dm-hub-toggle") && !t.dataset.locked) {
            const plugin = t.dataset.plugin!;
            const key = t.dataset.key!;
            const next = !getSetting(plugin, key);
            const entry = QUICK_TOGGLES.find(e => e.plugin === plugin && e.settingKey === key);
            setSetting(plugin, key, next, entry?.noRestart);
            // Re-render after setting
            panelRoot!.innerHTML = renderPanelHTML();
        }
    });
}

function togglePanel() {
    ensurePanelRoot();
    const wasHidden = panelRoot!.classList.contains("hidden");
    if (wasHidden) {
        panelRoot!.innerHTML = renderPanelHTML();
        panelRoot!.classList.remove("hidden");
    } else {
        panelRoot!.classList.add("hidden");
    }
}

// Inject the FAB button into Discord's user-panel toolbar, immediately to the
// LEFT of the mic mute button. The toolbar re-renders on focus changes, so we
// re-inject from a MutationObserver.
function injectButton() {
    const mic = document.querySelector('button[aria-label*="ute" i]') as HTMLButtonElement | null;
    if (!mic) return;
    const micParent = mic.parentElement; // audioButtonParent__5e764
    const buttonsRow = micParent?.parentElement; // buttons__37e49
    if (!buttonsRow || buttonsRow.querySelector(`#${FAB_ID}`)) return;

    const fab = document.createElement("button");
    fab.id = FAB_ID;
    fab.title = "Discordmaxxer — quick toggles";
    fab.innerHTML = `<img src="${FAB_LOGO_DATA}" width="26" height="26" alt="Discordmaxxer" style="display:block;pointer-events:none;border-radius:50%"/>`;
    fab.addEventListener("click", e => {
        e.preventDefault();
        e.stopPropagation();
        togglePanel();
    });

    buttonsRow.insertBefore(fab, micParent ?? buttonsRow.firstChild);
}

function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton(); // initial pass
}

function stopObserver() {
    observer?.disconnect();
    observer = null;
    document.getElementById(FAB_ID)?.remove();
    panelRoot?.remove();
    panelRoot = null;
}

export default definePlugin({
    name: "DMHub",
    description:
        "DM button injected into Discord's user-panel toolbar (next to username, before the mic icon). " +
        "Click for VIP tier badge, premium features, and quick toggles for all Discordmaxxer custom plugins. " +
        "Toggling a setting here also re-initializes the affected plugin so changes take effect immediately.",
    authors: [{ name: "Diggy", id: 0n }],

    start() {
        style = createAndAppendStyle("dm-hub", managedStyleRootNode);
        style.textContent = HUB_CSS;
        if (document.body) startObserver();
        else document.addEventListener("DOMContentLoaded", startObserver, { once: true });
    },

    stop() {
        stopObserver();
        style?.remove();
    }
});
