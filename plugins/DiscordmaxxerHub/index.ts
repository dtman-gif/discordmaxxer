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

let panelRoot: HTMLDivElement | null = null;
let style: HTMLStyleElement;
let observer: MutationObserver | null = null;

const HUB_CSS = `
    /* Toolbar button — match Discord's user-panel icon style */
    #${FAB_ID} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        margin: 0 2px;
        padding: 0;
        border-radius: 4px;
        background: linear-gradient(135deg, #e25bff, #4c51f7);
        color: #fbefff;
        font-weight: 800;
        font-size: 11px;
        letter-spacing: -0.3px;
        border: none;
        cursor: pointer;
        transition: filter 0.15s, box-shadow 0.15s;
        font-family: -apple-system, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 0 0 1px rgba(255,255,255,0.12);
    }
    #${FAB_ID}:hover {
        filter: brightness(1.15);
        box-shadow: 0 0 12px rgba(226,91,255,0.55), 0 0 0 1px rgba(255,255,255,0.2);
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
}

const QUICK_TOGGLES: QuickToggle[] = [
    { plugin: "VideoBackground", label: "🌟 Video Background", settingKey: "enable", minTier: Tier.MAXXER_PLUS, note: "Set URL in Vencord plugin settings" },
    { plugin: "DiscordmaxxerTheme", label: "🎨 Maxxer Theme", settingKey: "enable" },
    { plugin: "TournamentMode", label: "🎮 Tournament Mode (Ctrl+Alt+T)" },
    { plugin: "CompactView", label: "📐 Compact View (Ctrl+Alt+H)" },
    { plugin: "MassDelete", label: "🗑️ Mass-Delete menu", settingKey: "enableContextMenu", note: "OPT-IN — TOS risk" },
    { plugin: "DiscordmaxxerBadge", label: "💎 Profile Badge", settingKey: "showOnOwnProfile" }
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

function setSetting(plugin: string, key: string, value: boolean) {
    const v = vencord();
    if (!v?.Settings?.plugins?.[plugin]) return;

    // 1) Persist the value through Vencord's settings proxy.
    v.Settings.plugins[plugin][key] = value;

    // 2) Re-init the plugin so its start() reads the new value and
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
            <div class="dm-hub-title">🐍 Discordmaxxer</div>
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
        <div class="dm-hub-footer">Full settings → Discord settings → Vencord → Plugins</div>
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
            setSetting(plugin, key, next);
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
    fab.textContent = "DM";
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
