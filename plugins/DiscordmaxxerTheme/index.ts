/*
 * Discordmaxxer — DiscordmaxxerTheme plugin
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Multi-theme system. Eight named palettes covering Discord's full
 * CSS-variable graph (brand, background, text, header, channels,
 * interactive, scrollbar). Switch via the `selected` setting.
 *
 * Free themes:
 *   - maxxer (default): magenta + cobalt
 *   - val: Valorant red + cream
 *   - sonic: gold + cobalt
 *   - dmc: blood red + bone (gothic, serif headings)
 *   - bo3: Black Ops 3 olive + neon orange
 *
 * MAXXER+ exclusives (v0.6.4):
 *   - akatsuki: bone + blood + void, red-cloud Akatsuki organization vibe
 *   - dmcdt: DMC: Devil Trigger — Dante's coat red + Sparda blue, devil-trigger pulse
 *   - eminence: slime magenta + atomic-blue lightning, "I am Shadow" theatrical
 *
 * Off by default — opt-in via plugin toggle.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import { Toasts } from "@webpack/common";
import definePlugin, { OptionType } from "@utils/types";

import { DEFAULT_THEME, THEME_ORDER, themeCss, themeFlairCss, THEMES, ThemeId } from "../_dm-shared/themes";
import { hasTier, TIER_LABELS } from "../_dm-shared/vip";

let style: HTMLStyleElement;
let flairStyle: HTMLStyleElement;
let appliedBodyClass: string | null = null;

function applyTheme(id: ThemeId) {
    let theme = THEMES[id] ?? THEMES[DEFAULT_THEME];

    // Tier gate — if the chosen theme requires a tier the user doesn't
    // hold, fall back to the default theme and surface a toast. We never
    // silently apply a different theme without telling the user.
    if (theme.tierGate !== undefined && !hasTier(theme.tierGate)) {
        const required = TIER_LABELS[theme.tierGate];
        console.warn(`[DiscordmaxxerTheme] theme="${id}" requires ${required} — falling back to ${DEFAULT_THEME}`);
        try {
            Toasts.show({
                message: `🔒 "${theme.label}" requires ${required} — using ${THEMES[DEFAULT_THEME].label} instead`,
                id: Toasts.genId(),
                type: Toasts.Type.MESSAGE,
                options: { duration: 4000 }
            });
        } catch { /* toast may not be ready during start() */ }
        theme = THEMES[DEFAULT_THEME];
    }

    if (style) style.textContent = themeCss(theme);
    if (flairStyle) flairStyle.textContent = settings.store.enableFlair === false ? "" : themeFlairCss(theme);

    // Body-class swap so per-theme component overrides can scope cleanly
    if (appliedBodyClass) document.body.classList.remove(appliedBodyClass);
    document.body.classList.add(theme.bodyClass);
    appliedBodyClass = theme.bodyClass;

    console.log(`[DiscordmaxxerTheme] applied theme=${theme.id} flair=${settings.store.enableFlair !== false}`);
}

function optionLabel(id: ThemeId): string {
    const t = THEMES[id];
    if (t.tierGate !== undefined) {
        const tierStr = TIER_LABELS[t.tierGate];
        return `🔒 ${t.label} (${tierStr}) — ${t.blurb}`;
    }
    return `${t.label} — ${t.blurb}`;
}

const settings = definePluginSettings({
    selected: {
        type: OptionType.SELECT,
        description: "Theme palette — covers Discord's full color graph (background, text, brand, channels, scrollbars). Locked themes require MAXXER+ — pick one and we'll fall back to the default if you don't qualify.",
        default: DEFAULT_THEME,
        options: THEME_ORDER.map(id => ({
            label: optionLabel(id),
            value: id,
            default: id === DEFAULT_THEME
        })),
        onChange: (value: ThemeId) => applyTheme(value)
    },
    enableFlair: {
        type: OptionType.BOOLEAN,
        description: "Enable theme character — layout (corners, density), custom typing dots, mention animations, hover effects. Turn off to keep colors only.",
        default: true,
        onChange: () => applyTheme(settings.store.selected as ThemeId)
    }
});

export default definePlugin({
    name: "DiscordmaxxerTheme",
    description:
        "Eight-theme system. Free: Maxxer (magenta+cobalt), Val (Valorant), Sonic (gold+cobalt), DMC (gothic), BO3 (military). MAXXER+ exclusives: Akatsuki (bone+blood+void), DMC: Devil Trigger (Dante red + Sparda blue + DT pulse), Eminence in Shadow (slime+atomic-lightning). Each overrides Discord's full color graph + adds personality flair (typing dots, mention animations, hover effects).",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {
        style = createAndAppendStyle("dm-theme", managedStyleRootNode);
        flairStyle = createAndAppendStyle("dm-theme-flair", managedStyleRootNode);
        applyTheme(settings.store.selected as ThemeId);
    },

    stop() {
        style?.remove();
        flairStyle?.remove();
        if (appliedBodyClass) {
            document.body.classList.remove(appliedBodyClass);
            appliedBodyClass = null;
        }
    }
});
