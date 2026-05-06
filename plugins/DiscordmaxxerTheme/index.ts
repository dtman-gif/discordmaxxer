/*
 * Discordmaxxer — DiscordmaxxerTheme plugin
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Multi-theme system. Five named palettes covering Discord's full
 * CSS-variable graph (brand, background, text, header, channels,
 * interactive, scrollbar). Switch via the `selected` setting.
 *
 * Themes:
 *   - maxxer (default): magenta + cobalt
 *   - val: Valorant red + cream
 *   - sonic: gold + cobalt
 *   - dmc: blood red + bone (gothic, serif headings)
 *   - bo3: Black Ops 3 olive + neon orange
 *
 * Off by default — opt-in via plugin toggle.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";

import { DEFAULT_THEME, THEME_ORDER, themeCss, THEMES, ThemeId } from "../_dm-shared/themes";

let style: HTMLStyleElement;
let appliedBodyClass: string | null = null;

function applyTheme(id: ThemeId) {
    const theme = THEMES[id] ?? THEMES[DEFAULT_THEME];

    if (style) style.textContent = themeCss(theme);

    // Body-class swap so per-theme component overrides can scope cleanly
    if (appliedBodyClass) document.body.classList.remove(appliedBodyClass);
    document.body.classList.add(theme.bodyClass);
    appliedBodyClass = theme.bodyClass;

    console.log(`[DiscordmaxxerTheme] applied theme=${id}`);
}

const settings = definePluginSettings({
    selected: {
        type: OptionType.SELECT,
        description: "Theme palette — covers Discord's full color graph (background, text, brand, channels, scrollbars).",
        default: DEFAULT_THEME,
        options: THEME_ORDER.map(id => ({
            label: `${THEMES[id].label} — ${THEMES[id].blurb}`,
            value: id,
            default: id === DEFAULT_THEME
        })),
        onChange: (value: ThemeId) => applyTheme(value)
    }
});

export default definePlugin({
    name: "DiscordmaxxerTheme",
    description:
        "Multi-theme system. Switch between Maxxer (magenta+cobalt), Val (Valorant), Sonic (gold+cobalt), DMC (gothic blood-red), or BO3 (Black Ops 3 military). Each theme overrides Discord's full color graph — backgrounds, text, brand accents, channel list, scrollbars. Toggle off to restore Discord defaults.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {
        style = createAndAppendStyle("dm-theme", managedStyleRootNode);
        applyTheme(settings.store.selected as ThemeId);
    },

    stop() {
        style?.remove();
        if (appliedBodyClass) {
            document.body.classList.remove(appliedBodyClass);
            appliedBodyClass = null;
        }
    }
});
