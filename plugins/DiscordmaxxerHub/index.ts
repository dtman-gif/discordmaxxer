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

// Full v1 horror-Clyde mark — speech bubble + horns + bullet holes + red eyes,
// 96px PNG with cream "sticker" background. Same asset DiscordmaxxerBadge uses
// in user popouts. Used at 22x22 in the FAB toolbar button (next to the mic)
// AND at 14x14 in the panel header. Silhouette form is rejected — we use the
// full horror-Clyde mark everywhere in the app.
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
    { plugin: "DiscordmaxxerTheme", label: "🎨 Maxxer Theme", settingKey: "enable" },
    { plugin: "TournamentMode", label: "🎮 Tournament Mode", settingKey: "manuallyActive", note: "Or press Ctrl+Alt+T", noRestart: true },
    { plugin: "CompactView", label: "📐 Compact View", settingKey: "manuallyActive", note: "Or press Ctrl+Alt+H", noRestart: true },
    { plugin: "MassDelete", label: "🗑️ Mass-Delete menu", settingKey: "enableContextMenu", note: "OPT-IN — TOS risk" },
    { plugin: "DiscordmaxxerBadge", label: "💎 Profile Badge", settingKey: "showOnOwnProfile" },
    { plugin: "DiscordmaxxerStreamMute", label: "🔇 Mute screenshare audio", settingKey: "muted", note: "Or press Ctrl+Shift+M", noRestart: true }
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
    name: "DiscordmaxxerHub",
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
