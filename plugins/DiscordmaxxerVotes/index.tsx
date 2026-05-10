/*
 * Discordmaxxer — DiscordmaxxerVotes plugin
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * MAXXER++ tier perk — plugin votes. Surfaces a panel of candidate
 * features that subscribers can vote on. Vote aggregation happens via
 * polls in the Maxxtopia Discord's #vip-chat channel — clicking "Vote"
 * jumps to that channel where Diggy posts a Discord-native poll for
 * each candidate. MAXXER++ users see the panel; FREE/MAXXER/MAXXER+
 * see a tier-gate explanation.
 *
 * Why no in-app voting backend (yet): Discord polls are a first-class
 * native feature with one-click voting + automatic tallying. Building
 * a parallel backend would be ceremony — the plugin's job is to *route
 * subscribers to the votes*, not to reimplement Discord's poll system.
 *
 * Future upgrade path: this plugin can be extended with a real Cloudflare
 * Worker tally endpoint (mirror of the optmaxxing-vip worker pattern) so
 * results show in the panel directly. The candidate list is static for
 * v0.6.7 — refresh via a CDN-hosted JSON file later.
 */

import { definePluginSettings } from "@api/Settings";
import { React } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

import { hasTier, Tier, tierGateMessage } from "../_dm-shared/vip";

const VIP_GATE = Tier.MAXXER_PLUS_PLUS;
const DISCORD_INVITE = "https://discord.gg/S78eecbWdx";
const VIP_CHAT_PATH = "channels/@me"; // fallback — plugin links to the invite first; Diggy can drop a deep-link later

interface Candidate {
    id: string;
    name: string;
    blurb: string;
    pollUrl?: string; // direct Discord poll deep-link (when one exists)
}

// Curated v0.6.7 candidate list. Reflects the actual remaining roadmap:
// per memory, future un-delivered tier perks + community-asks. Diggy
// updates this list per release; voting happens in #vip-chat.
const CANDIDATES: Candidate[] = [
    {
        id: "real-sound-packs-extension",
        name: "Sound packs for MAXXER+ themes (akatsuki/dmcdt/eminence)",
        blurb:
            "Curate audio sets for the three MAXXER+ exclusive themes (currently they fall back to the default Material Design clips)."
    },
    {
        id: "twenty-mention-chimes",
        name: "20+ themed mention chimes library",
        blurb:
            "Diggy's roadmap originally promised a library — chime currently uses the active theme's notify sound. Expand to a curated library + chooser."
    },
    {
        id: "voice-channel-themes",
        name: "Tier-themed voice-channel audio cues",
        blurb:
            "Custom join/leave/mute SFX matched to your active theme — replaces Discord's defaults for MAXXER+/++."
    },
    {
        id: "custom-cursor-bring-your-own",
        name: "Bring-your-own cursor (PNG upload)",
        blurb:
            "MAXXER++ lets you upload a custom PNG cursor instead of picking from the bundled six. Local-only, never synced."
    },
    {
        id: "tournament-mode-hotkey",
        name: "Tournament Mode global keyboard shortcut",
        blurb:
            "One-key toggle to enter performance mode without alt-tabbing. Ctrl+Shift+T or whatever you bind."
    },
    {
        id: "rich-presence-game-detector",
        name: "Game-aware Rich Presence",
        blurb:
            "MAXXER++ presence shows your current game's name + elapsed time, not just 'Discordmaxxer'. Auto-detects from running processes."
    },
    {
        id: "plugin-spotlight-rotation",
        name: "Hub Plugin Spotlight rotation",
        blurb:
            "Auto-rotating featured-plugin card in the Hub showing one less-known Vencord plugin each launch with a one-click enable."
    }
];

function VotesPanel() {
    const allowed = hasTier(VIP_GATE);

    if (!allowed) {
        return (
            <div style={{
                padding: "14px 16px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, rgba(255,170,0,0.06), rgba(255,170,0,0.02))",
                border: "1px solid rgba(255,170,0,0.18)"
            }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#FFD27A", marginBottom: "6px" }}>
                    🔒 Plugin Votes — MAXXER++ only
                </div>
                <div style={{ fontSize: "12.5px", color: "#bcc3d3", lineHeight: 1.5 }}>
                    {tierGateMessage(VIP_GATE)}
                </div>
                <div style={{ fontSize: "11.5px", color: "#8a91a3", marginTop: "8px", lineHeight: 1.4 }}>
                    MAXXER++ subscribers vote on what features get built next via polls in the Maxxtopia
                    Discord's <code>#vip-chat</code> channel. Top-voted candidates ship in the next release.
                </div>
            </div>
        );
    }

    const open = (c: Candidate) => {
        const url = c.pollUrl || DISCORD_INVITE;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{
                fontSize: "12.5px",
                color: "#bcc3d3",
                lineHeight: 1.5,
                padding: "10px 12px",
                borderRadius: "6px",
                background: "rgba(255,170,0,0.05)",
                border: "1px solid rgba(255,170,0,0.18)"
            }}>
                <strong style={{ color: "#FFD27A" }}>★ MAXXER++ — Plugin Votes</strong>
                <br />
                Vote on what ships next. Polls live in <code>#vip-chat</code> in the Maxxtopia Discord;
                Diggy ships the top-voted candidate in the next release. Click any card to jump to its poll.
            </div>

            {CANDIDATES.map(c => (
                <button
                    key={c.id}
                    onClick={() => open(c)}
                    style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: "6px",
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "#cbd0e0",
                        cursor: "pointer",
                        font: "inherit",
                        transition: "all 0.12s ease"
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = "rgba(255,170,0,0.08)";
                        e.currentTarget.style.borderColor = "rgba(255,170,0,0.30)";
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    }}
                >
                    <div style={{ fontSize: "13.5px", fontWeight: 600, color: "#ffe8b3", marginBottom: "4px" }}>
                        {c.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "#a0a6b4", lineHeight: 1.4 }}>
                        {c.blurb}
                    </div>
                    <div style={{ fontSize: "11px", color: "#FFD27A", marginTop: "6px", letterSpacing: "0.04em" }}>
                        Vote in #vip-chat →
                    </div>
                </button>
            ))}
        </div>
    );
}

const settings = definePluginSettings({
    panel: {
        type: OptionType.COMPONENT,
        description: "",
        component: VotesPanel
    }
});

export default definePlugin({
    name: "DiscordmaxxerVotes",
    description:
        "MAXXER++ perk — vote on what ships next. Lists candidate features and routes you to Discord polls in #vip-chat for native one-click voting. The top-voted candidate ships in the next release.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {},
    stop() {}
});
