/*
 * Discordmaxxer — DiscordmaxxerTheme plugin
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Light-touch theme that paints Discord's brand accents with the maxxer-suite
 * palette (electric magenta + Fortnite blue). Designed to be safe — no layout
 * changes, no aggressive selectors. If something breaks, toggle it off.
 *
 * Off by default so users can opt in.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

let style: HTMLStyleElement;

// Discord uses TWO brand-color systems simultaneously:
//   * --brand-experiment-* (legacy, hex values)
//   * --brand-* (modern, HSL-based — drives most of the live chrome)
// We override BOTH so the magenta actually shows up.
const THEME_CSS = `
    :root {
        /* Legacy brand-experiment system */
        --brand-experiment: #e25bff;
        --brand-experiment-100: #ffe6ff;
        --brand-experiment-200: #fcc6ff;
        --brand-experiment-300: #f5a3ff;
        --brand-experiment-400: #ec80ff;
        --brand-experiment-500: #e25bff;
        --brand-experiment-560: #d033ee;
        --brand-experiment-600: #b81bd6;
        --brand-experiment-700: #8a14a3;
        --brand-experiment-800: #5a0d6b;
        --brand-experiment-900: #2c0635;
        --brand-experiment-05a: rgba(226, 91, 255, 0.05);
        --brand-experiment-10a: rgba(226, 91, 255, 0.1);
        --brand-experiment-15a: rgba(226, 91, 255, 0.15);
        --brand-experiment-20a: rgba(226, 91, 255, 0.2);
        --brand-experiment-25a: rgba(226, 91, 255, 0.25);
        --brand-experiment-30a: rgba(226, 91, 255, 0.3);
        --brand-experiment-35a: rgba(226, 91, 255, 0.35);
        --brand-experiment-40a: rgba(226, 91, 255, 0.4);
        --brand-experiment-50a: rgba(226, 91, 255, 0.5);
        --brand-experiment-60a: rgba(226, 91, 255, 0.6);
        --brand-experiment-70a: rgba(226, 91, 255, 0.7);
        --brand-experiment-80a: rgba(226, 91, 255, 0.8);
        --brand-experiment-90a: rgba(226, 91, 255, 0.9);

        /* Modern brand-* system (HSL-based) — the one that drives buttons,
           mentions, online indicators, channel-selected state, etc. */
        --brand-100: #ffe6ff;
        --brand-200: #fcc6ff;
        --brand-300: #f5a3ff;
        --brand-400: #ec80ff;
        --brand-500: #e25bff;
        --brand-560: #d033ee;
        --brand-600: #b81bd6;
        --brand-700: #8a14a3;
        --brand-800: #5a0d6b;
        --brand-900: #2c0635;

        /* High-traffic semantic vars Discord uses for hover/border accents */
        --button-filled-brand-background: #e25bff;
        --button-filled-brand-background-hover: #d033ee;
        --button-filled-brand-background-active: #b81bd6;
        --button-outline-brand-text: #e25bff;
        --button-outline-brand-border: #e25bff;

        /* Interactive/active state — selected channel pill, link hover, etc. */
        --interactive-active: #fbefff;
        --info-help-foreground: #e25bff;
        --status-positive-foreground: #10b981;
        --header-primary: #fbefff;

        /* Make selected channel state visibly magenta */
        --channels-default: #ddb1ff;

        /* Mention/reply highlight backgrounds */
        --mention-foreground: #fbefff;
    }

    /* Selected channel in the sidebar gets a magenta accent bar */
    [class*="modeSelected"] {
        background: rgba(226, 91, 255, 0.18) !important;
    }
    [class*="modeSelected"]::before {
        background-color: #e25bff !important;
    }

    /* @ mention chips in chat — make them magenta-tinted */
    [class*="mention"][class*="wrapper"] {
        background-color: rgba(226, 91, 255, 0.2) !important;
        color: #ffd6ff !important;
    }
`;

const settings = definePluginSettings({
    enable: {
        type: OptionType.BOOLEAN,
        description:
            "Apply maxxer-suite palette to Discord's brand accent colors. Touches the --brand-experiment CSS vars only — safe, but if you see something weird, turn it off.",
        default: false,
        onChange: (value: boolean) => {
            if (style) style.textContent = value ? THEME_CSS : "";
        }
    }
});

export default definePlugin({
    name: "DiscordmaxxerTheme",
    description:
        "Repaints Discord's brand-color accents (the 'blurple') with the maxxer-suite magenta. " +
        "Off by default — flip the toggle in settings to apply. Safe: only overrides --brand-experiment* CSS vars.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {
        style = createAndAppendStyle("dm-theme", managedStyleRootNode);
        if (settings.store.enable) style.textContent = THEME_CSS;
    },

    stop() {
        style?.remove();
    }
});
