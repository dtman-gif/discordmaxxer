/*
 * Discordmaxxer — theme registry
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Five named themes, each a complete Discord color-palette override.
 * Sourced from optimizationmaxxing's profile system (Val/Sonic/DMC/BO3)
 * adapted for Discord's CSS variable namespace + the original Maxxer
 * brand (magenta + cobalt).
 *
 * Each theme covers Discord's full var graph: brand, background,
 * text, header, channels, interactive, scrollbar. Cosmetic-only —
 * does not change layout or hide elements.
 */

export type ThemeId = "maxxer" | "val" | "sonic" | "dmc" | "bo3";

export interface ThemePalette {
    /** Primary brand accent (button fills, links, mention pings). */
    brand: string;
    /** Lighter variant for hover states. */
    brandSoft: string;
    /** Darker variant for active/pressed states. */
    brandDark: string;
    /** Translucent overlay for selected items. */
    brandTrans: string;

    /** Main message-area background. */
    bgPrimary: string;
    /** Channel sidebar background. */
    bgSecondary: string;
    /** Slightly dimmer than secondary; used for nested panels. */
    bgSecondaryAlt: string;
    /** Server-rail / content-card background. */
    bgTertiary: string;
    /** Popover / dropdown / modal background. */
    bgFloating: string;
    /** Message-input background. */
    bgInput: string;

    /** Default body text. */
    textNormal: string;
    /** Secondary / metadata text. */
    textMuted: string;
    /** Disabled / placeholder text. */
    textSubtle: string;
    /** Hyperlink color. */
    textLink: string;

    /** Channel-list link color (default state). */
    channelText: string;
    /** Channel-list link color (hover). */
    channelTextHover: string;

    /** Subtle border / divider line. */
    border: string;
    /** Brighter border for focus / active. */
    borderGlow: string;
}

export interface Theme {
    id: ThemeId;
    label: string;
    blurb: string;
    bodyClass: string;
    /** Two-color swatch for the picker UI. */
    swatch: { primary: string; secondary: string };
    palette: ThemePalette;
    /** Optional font-family override for headings (DMC uses serif). */
    headingFont?: string;
}

const FONT_BODY = "-apple-system, 'Segoe UI', Roboto, sans-serif";

export const THEMES: Record<ThemeId, Theme> = {
    maxxer: {
        id: "maxxer",
        label: "Maxxer",
        blurb: "The original — magenta + cobalt. Default Discordmaxxer brand.",
        bodyClass: "dm-theme-maxxer",
        swatch: { primary: "#e25bff", secondary: "#4c51f7" },
        palette: {
            brand: "#e25bff",
            brandSoft: "#ec80ff",
            brandDark: "#b81bd6",
            brandTrans: "rgba(226, 91, 255, 0.18)",
            bgPrimary: "#15101e",
            bgSecondary: "#1a1428",
            bgSecondaryAlt: "#120c1a",
            bgTertiary: "#0a0612",
            bgFloating: "#1c1530",
            bgInput: "#241a3a",
            textNormal: "#fbefff",
            textMuted: "#c8a8e6",
            textSubtle: "#8b6aad",
            textLink: "#e25bff",
            channelText: "#a890c4",
            channelTextHover: "#fbefff",
            border: "rgba(226, 91, 255, 0.18)",
            borderGlow: "rgba(226, 91, 255, 0.45)"
        }
    },
    val: {
        id: "val",
        label: "Val",
        blurb: "Tactical. Red + cream. Inspired by Valorant.",
        bodyClass: "dm-theme-val",
        swatch: { primary: "#ff4655", secondary: "#0f1923" },
        palette: {
            brand: "#ff4655",
            brandSoft: "#ff7a87",
            brandDark: "#b3303c",
            brandTrans: "rgba(255, 70, 85, 0.2)",
            bgPrimary: "#0d1418",
            bgSecondary: "#16252c",
            bgSecondaryAlt: "#0a0f12",
            bgTertiary: "#08111a",
            bgFloating: "#1a2a32",
            bgInput: "#1e2f38",
            textNormal: "#ece8e1",
            textMuted: "#c8b89a",
            textSubtle: "#8e8579",
            textLink: "#ff7a87",
            channelText: "#a8a094",
            channelTextHover: "#ff4655",
            border: "rgba(255, 70, 85, 0.18)",
            borderGlow: "rgba(255, 70, 85, 0.4)"
        }
    },
    sonic: {
        id: "sonic",
        label: "Sonic",
        blurb: "Speed. Cobalt + gold. Bright and kinetic.",
        bodyClass: "dm-theme-sonic",
        swatch: { primary: "#ffd700", secondary: "#007aff" },
        palette: {
            brand: "#ffd700",
            brandSoft: "#ffea66",
            brandDark: "#cca400",
            brandTrans: "rgba(255, 215, 0, 0.22)",
            bgPrimary: "#051e3e",
            bgSecondary: "#0a3a73",
            bgSecondaryAlt: "#031530",
            bgTertiary: "#020a1a",
            bgFloating: "#0f4080",
            bgInput: "#114a8e",
            textNormal: "#ffffff",
            textMuted: "#c5d6f0",
            textSubtle: "#7e9ec8",
            textLink: "#ffd700",
            channelText: "#9bb4d8",
            channelTextHover: "#ffd700",
            border: "rgba(255, 215, 0, 0.22)",
            borderGlow: "rgba(255, 215, 0, 0.5)"
        }
    },
    dmc: {
        id: "dmc",
        label: "DMC",
        blurb: "Gothic. Blood red + bone + obsidian. Devil May Cry energy.",
        bodyClass: "dm-theme-dmc",
        swatch: { primary: "#b3000c", secondary: "#6b2737" },
        palette: {
            brand: "#b3000c",
            brandSoft: "#e63946",
            brandDark: "#7a0008",
            brandTrans: "rgba(179, 0, 12, 0.22)",
            bgPrimary: "#0a0506",
            bgSecondary: "#1a0e10",
            bgSecondaryAlt: "#070304",
            bgTertiary: "#040202",
            bgFloating: "#241318",
            bgInput: "#2a161c",
            textNormal: "#f4ecd8",
            textMuted: "#c4b89a",
            textSubtle: "#8a7c66",
            textLink: "#e63946",
            channelText: "#a89878",
            channelTextHover: "#b3000c",
            border: "rgba(179, 0, 12, 0.22)",
            borderGlow: "rgba(179, 0, 12, 0.55)"
        },
        headingFont: "'Cormorant Garamond', Georgia, serif"
    },
    bo3: {
        id: "bo3",
        label: "Black Ops 3",
        blurb: "Military / cyber. Olive + neon orange + matte black.",
        bodyClass: "dm-theme-bo3",
        swatch: { primary: "#ff6b1a", secondary: "#5a6840" },
        palette: {
            brand: "#ff6b1a",
            brandSoft: "#ffa14d",
            brandDark: "#b34a0e",
            brandTrans: "rgba(255, 107, 26, 0.22)",
            bgPrimary: "#0e0f0a",
            bgSecondary: "#1c1d15",
            bgSecondaryAlt: "#080905",
            bgTertiary: "#040402",
            bgFloating: "#252618",
            bgInput: "#2c2d1c",
            textNormal: "#e9e8df",
            textMuted: "#b3b09e",
            textSubtle: "#7e7c6c",
            textLink: "#ff6b1a",
            channelText: "#9b9989",
            channelTextHover: "#ff6b1a",
            border: "rgba(255, 107, 26, 0.22)",
            borderGlow: "rgba(255, 107, 26, 0.5)"
        }
    }
};

export const THEME_ORDER: ThemeId[] = ["maxxer", "val", "sonic", "dmc", "bo3"];
export const DEFAULT_THEME: ThemeId = "maxxer";

/**
 * Build the full CSS-variable override for a given theme. Maps the small
 * palette to Discord's full CSS-var namespace (background-*, text-*,
 * header-*, channels-*, interactive-*, scrollbar-*, brand-*).
 */
export function themeCss(theme: Theme): string {
    const p = theme.palette;
    return `
    :root, body.${theme.bodyClass} {
        /* Brand — both legacy + modern Discord var systems */
        --brand-experiment: ${p.brand};
        --brand-experiment-100: ${p.brandSoft};
        --brand-experiment-200: ${p.brandSoft};
        --brand-experiment-300: ${p.brandSoft};
        --brand-experiment-400: ${p.brand};
        --brand-experiment-500: ${p.brand};
        --brand-experiment-560: ${p.brandDark};
        --brand-experiment-600: ${p.brandDark};
        --brand-experiment-700: ${p.brandDark};
        --brand-experiment-05a: ${p.brandTrans};
        --brand-experiment-10a: ${p.brandTrans};
        --brand-experiment-15a: ${p.brandTrans};
        --brand-experiment-20a: ${p.brandTrans};
        --brand-experiment-30a: ${p.brandTrans};
        --brand-500: ${p.brand};
        --brand-360: ${p.brandSoft};
        --brand-400: ${p.brand};
        --brand-460: ${p.brand};
        --brand-560: ${p.brandDark};
        --brand-600: ${p.brandDark};

        /* Background */
        --background-primary: ${p.bgPrimary};
        --background-secondary: ${p.bgSecondary};
        --background-secondary-alt: ${p.bgSecondaryAlt};
        --background-tertiary: ${p.bgTertiary};
        --background-floating: ${p.bgFloating};
        --background-message-hover: ${p.brandTrans};
        --background-modifier-hover: ${p.brandTrans};
        --background-modifier-selected: ${p.brandTrans};
        --background-modifier-active: ${p.brandTrans};
        --background-modifier-accent: ${p.borderGlow};
        --bg-overlay-1: ${p.bgFloating};
        --bg-overlay-2: ${p.bgSecondary};
        --bg-overlay-3: ${p.bgSecondaryAlt};
        --bg-overlay-chat: ${p.bgPrimary};
        --bg-overlay-app-frame: ${p.bgTertiary};

        /* Text */
        --text-normal: ${p.textNormal};
        --text-default: ${p.textNormal};
        --text-muted: ${p.textMuted};
        --text-secondary: ${p.textMuted};
        --text-tertiary: ${p.textSubtle};
        --text-subtle: ${p.textSubtle};
        --text-link: ${p.textLink};
        --text-link-low-saturation: ${p.textLink};
        --header-primary: ${p.textNormal};
        --header-secondary: ${p.textMuted};

        /* Channels list */
        --channels-default: ${p.channelText};
        --channeltextarea-background: ${p.bgInput};
        --channel-icon: ${p.channelText};
        --interactive-normal: ${p.channelText};
        --interactive-hover: ${p.channelTextHover};
        --interactive-active: ${p.textNormal};
        --interactive-muted: ${p.textSubtle};

        /* Status / accents */
        --status-positive: #65d16e;
        --status-warning: ${p.brandSoft};
        --status-danger: ${p.brand};

        /* Scrollbars */
        --scrollbar-thin-thumb: ${p.brandTrans};
        --scrollbar-thin-track: transparent;
        --scrollbar-auto-thumb: ${p.brandTrans};
        --scrollbar-auto-track: ${p.bgSecondaryAlt};
    }
    ${theme.headingFont ? `
    body.${theme.bodyClass} h1, body.${theme.bodyClass} h2, body.${theme.bodyClass} h3 {
        font-family: ${theme.headingFont};
    }` : ""}
    `;
}
