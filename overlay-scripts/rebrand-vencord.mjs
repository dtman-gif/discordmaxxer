/*
 * Discordmaxxer — Vencord source-rebrand pipeline
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Applies text-level patches to vencord-src/ before the Vencord build runs.
 * Used to strip Vencord branding from user-visible UI surfaces (settings tab
 * title, donation prompt, etc.) and replace them with Discordmaxxer-branded
 * content.
 *
 * Idempotent: each patch checks if the target text is already present and
 * skips. If `find` is missing AND `replace` is present, we count it as
 * already-patched. If neither, we warn (upstream Vencord changed shape).
 *
 * GPL-3 attribution: per-file copyright headers + LICENSE + NOTICE.md remain
 * intact. We only patch user-visible UI strings, never copyright notices.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENCORD_SRC = resolve(__dirname, "..", "vencord-src");

const PATCHES = [
    // ── A. Settings tab title ──────────────────────────────────────────
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'wrapTab(VencordSettings, "Vencord Settings")',
        replace: 'wrapTab(VencordSettings, "Discordmaxxer")'
    },

    // ── B. Donation card → DiscordmaxxerVipCard ────────────────────────
    // The donation card was a 2-branch SpecialCard ternary (donor vs non-
    // donor). The VIP-card patch (added later in this file) replaces the
    // entire ternary with <DiscordmaxxerVipCard />, so the previous
    // patches that retitled / re-described the donation card are no
    // longer applicable — removed in commit landing the VipCard.
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: "description=\"Since you've contributed to Vencord you now have a cool new badge!\"",
        replace: 'description="Thanks for contributing! Your contributor badge is active across Discordmaxxer."'
    },

    // ── C. DonateButton: URL + label ───────────────────────────────────
    {
        file: "src/components/settings/DonateButton.tsx",
        find: 'https://github.com/sponsors/Vendicated',
        replace: 'https://discordmaxxer.dev/vip'
    },
    {
        file: "src/components/settings/DonateButton.tsx",
        find: '            Donate\n',
        replace: '            View VIP\n'
    },
    {
        file: "src/components/settings/DonateButton.tsx",
        find: 'className="vc-donate-button"',
        replace: 'className="dm-vip-button"'
    },

    // ── D. Settings sidebar: rename "Vencord" link + "Vencord Settings" header ──
    {
        file: "src/plugins/_core/settings.tsx",
        find: 'title: "Vencord",\n                panelTitle: "Vencord Settings",',
        replace: 'title: "Discordmaxxer",\n                panelTitle: "Discordmaxxer",'
    },
    {
        file: "src/plugins/_core/settings.tsx",
        find: 'panelTitle: "Vencord Updater",',
        replace: 'panelTitle: "Updates",'
    },
    {
        file: "src/plugins/_core/settings.tsx",
        find: 'panelTitle: "Vencord Cloud",',
        replace: 'panelTitle: "Cloud Sync",'
    },
    {
        file: "src/plugins/_core/settings.tsx",
        find: 'useTitle: () => "Vencord Settings",',
        replace: 'useTitle: () => "Discordmaxxer",'
    },
    {
        file: "src/plugins/_core/settings.tsx",
        find: 'description: "Where to put the Vencord settings section",',
        replace: 'description: "Where to put the Discordmaxxer settings section",'
    },
    {
        file: "src/plugins/_core/settings.tsx",
        find: "Also copy Vencord info (Vencord, Electron, Chromium)",
        replace: "Also copy Discordmaxxer info (Vencord engine, Electron, Chromium)"
    },

    // ── E. Strip image + brand color from the contributor card ─────────
    // (Donation-card variants of these patches were removed when the
    // VipCard replaced the donation slot.)
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'cardImage={COZY_CONTRIB_IMAGE}',
        replace: 'cardImage=""'
    },
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'backgroundImage={CONTRIB_BACKGROUND_IMAGE}',
        replace: 'backgroundImage=""'
    },
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find: 'backgroundColor="#EDCC87"',
        replace: 'backgroundColor="#3a2e0e"'
    },

    // ── G. Updater tab — strip Vencord/Vesktop dual-attribution card + descriptions ──
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: '<HeadingSecondary>Vesktop & Vencord</HeadingSecondary>',
        replace: '<HeadingSecondary>Discordmaxxer Updates</HeadingSecondary>'
    },
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: '<Paragraph>Vesktop and Vencord are two separate things. This updater is for Vencord.</Paragraph>',
        replace: '<Paragraph>This updater keeps your Discordmaxxer plugin engine current.</Paragraph>'
    },
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: 'You receive separate popups for Vesktop updates. You can also manually update by installing the <Link href="https://vesktop.dev/install">latest version</Link>.',
        replace: 'App-level updates are handled separately. You can manually update by installing the <Link href="https://discordmaxxer.dev/download">latest version</Link>.'
    },
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: 'description="Automatically update Vencord without confirmation prompt"',
        replace: 'description="Automatically update the plugin engine without confirmation prompt"'
    },
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: 'description="Show a notification when Vencord automatically updates"',
        replace: 'description="Show a notification when the plugin engine automatically updates"'
    },

    // ── H. Drop the heart icon from the VIP button ──
    {
        file: "src/components/settings/DonateButton.tsx",
        find: 'import { Heart } from "@components/Heart";\n',
        replace: ""
    },
    {
        file: "src/components/settings/DonateButton.tsx",
        find: "<Heart />\n            View VIP",
        replace: "View VIP"
    },

    // ── I. ChatButtons API: right-click chat bar context menu ──
    {
        file: "src/api/ChatButtons.tsx",
        find: '<Menu.MenuItem id="vc-chat-buttons" key="vencord-chat-buttons" label="Vencord Buttons">',
        replace: '<Menu.MenuItem id="vc-chat-buttons" key="vencord-chat-buttons" label="Discordmaxxer Buttons">'
    },

    // ── J. Toolbox header tooltip ──
    {
        file: "src/plugins/vencordToolbox/index.tsx",
        find: 'tooltip={isShown ? null : "Vencord Toolbox"}',
        replace: 'tooltip={isShown ? null : "Discordmaxxer Toolbox"}'
    },

    // ── K. GameActivityToggle: header dropdown ──
    {
        file: "src/plugins/gameActivityToggle/index.tsx",
        find: '{ label: "Vencord Toolbox", value: "TOOLBOX" }',
        replace: '{ label: "Discordmaxxer Toolbox", value: "TOOLBOX" }'
    },

    // ── L. Monaco QuickCSS editor window title ──
    {
        file: "src/main/monacoWin.html",
        find: "<title>Vencord QuickCSS Editor</title>",
        replace: "<title>Discordmaxxer QuickCSS Editor</title>"
    },

    // ── M. NotificationSettings — in-app notification description ──
    {
        file: "src/components/settings/tabs/vencord/NotificationSettings.tsx",
        find: "<li><strong>Vencord Notifications</strong>: These are in-app notifications</li>",
        replace: "<li><strong>Discordmaxxer Notifications</strong>: These are in-app notifications</li>"
    },
    {
        file: "src/components/settings/tabs/vencord/NotificationSettings.tsx",
        find: '{ label: "Always use Vencord notifications", value: "never" },',
        replace: '{ label: "Always use Discordmaxxer notifications", value: "never" },'
    },

    // ── N. CloudTab — settings sync description ──
    {
        file: "src/components/settings/tabs/sync/CloudTab.tsx",
        find: 'description="Save your Vencord settings to the cloud so you can easily keep them the same on all your devices"',
        replace: 'description="Save your Discordmaxxer settings to the cloud so you can easily keep them the same on all your devices"'
    },

    // ── O. Updater — outdated-app card ──
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: "<HeadingSecondary>Vesktop Outdated</HeadingSecondary>",
        replace: "<HeadingSecondary>Discordmaxxer Outdated</HeadingSecondary>"
    },
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: "<Paragraph>Your version of Vesktop is outdated!</Paragraph>",
        replace: "<Paragraph>Your version of Discordmaxxer is outdated!</Paragraph>"
    },
    {
        file: "src/components/settings/tabs/updater/index.tsx",
        find: "Open Vesktop Updater",
        replace: "Open Discordmaxxer Updater"
    },

    // ── P. SettingsSync offline — backup file label + parse error ──
    {
        file: "src/api/SettingsSync/offline.ts",
        find: 'throw new Error("Invalid Settings. Is this even a Vencord Settings file?");',
        replace: 'throw new Error("Invalid Settings. Is this even a Discordmaxxer Settings file?");'
    },
    {
        file: "src/api/SettingsSync/offline.ts",
        find: '{ name: "Vencord Settings Backup", extensions: ["json"] },',
        replace: '{ name: "Discordmaxxer Settings Backup", extensions: ["json"] },'
    },

    // ── Q. Plugins-tab excluded-reasons (user-facing) ──
    {
        file: "src/components/settings/tabs/plugins/index.tsx",
        find: 'desktop: "Discord Desktop app or Vesktop",',
        replace: 'desktop: "Discord Desktop app or Discordmaxxer",'
    },
    {
        file: "src/components/settings/tabs/plugins/index.tsx",
        find: 'vesktop: "Vesktop app",',
        replace: 'vesktop: "Discordmaxxer app",'
    },
    {
        file: "src/components/settings/tabs/plugins/index.tsx",
        find: 'web: "Vesktop app and the Web version of Discord",',
        replace: 'web: "Discordmaxxer app and the Web version of Discord",'
    },
    {
        file: "src/components/settings/tabs/plugins/index.tsx",
        find: 'dev: "Developer version of Vencord"',
        replace: 'dev: "Developer build of Discordmaxxer"'
    },

    // ── R. CSP manager + theme CSP error card ──
    {
        file: "src/main/csp/manager.ts",
        find: '`You will have to fully close and restart ${IS_DISCORD_DESKTOP ? "Discord" : "Vesktop"} for the changes to take effect.`;',
        replace: '`You will have to fully close and restart ${IS_DISCORD_DESKTOP ? "Discord" : "Discordmaxxer"} for the changes to take effect.`;'
    },
    {
        file: "src/components/settings/tabs/themes/CspErrorCard.tsx",
        find: 'After allowing a domain, you have to fully close (from tray / task manager) and restart {IS_DISCORD_DESKTOP ? "Discord" : "Vesktop"} to apply the change.',
        replace: 'After allowing a domain, you have to fully close (from tray / task manager) and restart {IS_DISCORD_DESKTOP ? "Discord" : "Discordmaxxer"} to apply the change.'
    },

    // ── S. webKeybinds plugin description ──
    {
        file: "src/plugins/webKeybinds.web/index.ts",
        find: 'description: "Re-adds keybinds missing in the web version of Discord: ctrl+t, ctrl+shift+t, ctrl+tab, ctrl+shift+tab, ctrl+1-9, ctrl+,. Only works fully on Vesktop/Legcord, not inside your browser",',
        replace: 'description: "Re-adds keybinds missing in the web version of Discord: ctrl+t, ctrl+shift+t, ctrl+tab, ctrl+shift+tab, ctrl+1-9, ctrl+,. Only works fully on Discordmaxxer, not inside your browser",'
    },

    // ── T. SupportHelper user-visible copy + slash-command names ──
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: '"Vencord DevBuild": !IS_STANDALONE,',
        replace: '"Discordmaxxer DevBuild": !IS_STANDALONE,'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: 'name: "vencord-debug",',
        replace: 'name: "discordmaxxer-debug",'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: 'description: "Send Vencord debug info",',
        replace: 'description: "Send Discordmaxxer debug info",'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: 'name: "vencord-plugins",',
        replace: 'name: "discordmaxxer-plugins",'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: 'description: "Send Vencord plugin list",',
        replace: 'description: "Send Discordmaxxer plugin list",'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: '<Forms.FormText>You are using an outdated version of Vencord! Chances are, your issue is already fixed.</Forms.FormText>',
        replace: '<Forms.FormText>You are using an outdated version of Discordmaxxer! Chances are, your issue is already fixed.</Forms.FormText>'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: '<Forms.FormText>You are using an externally updated Vencord version, which we do not provide support for!</Forms.FormText>',
        replace: '<Forms.FormText>You are using an externally updated Discordmaxxer build, which we do not provide support for!</Forms.FormText>'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: '<Forms.FormText>You are using a custom build of Vencord, which we do not provide support for!</Forms.FormText>',
        replace: '<Forms.FormText>You are using a custom build of Discordmaxxer, which we do not provide support for!</Forms.FormText>'
    },
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: 'props.message.content.includes("/vencord-debug") || props.message.content.includes("/vencord-plugins")',
        replace: 'props.message.content.includes("/discordmaxxer-debug") || props.message.content.includes("/discordmaxxer-plugins")'
    },

    // ── Settings sidebar version footer (most visible leak) ────────────
    {
        file: "src/plugins/_core/settings.tsx",
        find: 'if (IS_VESKTOP) return ` (Vesktop v${VesktopNative.app.getVersion()})`;',
        replace: 'if (IS_VESKTOP) return ` (v${VesktopNative.app.getVersion()})`;'
    },
    {
        file: "src/plugins/_core/settings.tsx",
        find: 'const rows = [`Vencord ${gitHash}${additionalInfo}`];',
        replace: 'const rows = [`Discordmaxxer ${gitHash}${additionalInfo}`];'
    },

    // ── Support helper client-name string ──────────────────────────────
    {
        file: "src/plugins/_core/supportHelper.tsx",
        find: 'if (IS_VESKTOP) return `Vesktop v${VesktopNative.app.getVersion()}`;',
        replace: 'if (IS_VESKTOP) return `Discordmaxxer v${VesktopNative.app.getVersion()}`;'
    },

    // ── Hypixel-style VIP card replaces the donation slot ──────────────
    // Adds the import for our 4-tier ladder card from plugins/_dm-shared/.
    // Find spans 2 consecutive imports so re-runs see find absent (the
    // VipCard line sits between them after patch -> idempotent).
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find:
            'import { SpecialCard } from "@components/settings/SpecialCard";\n' +
            'import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";',
        replace:
            'import { SpecialCard } from "@components/settings/SpecialCard";\n' +
            'import { DiscordmaxxerVipCard } from "../../../../userplugins/_dm-shared/VipCard";\n' +
            'import { SettingsTab, wrapTab } from "@components/settings/tabs/BaseTab";'
    },
    // Replace the entire isDonor ternary (two SpecialCards) with our card.
    {
        file: "src/components/settings/tabs/vencord/index.tsx",
        find:
            '            {isDonor(user?.id)\n' +
            '                ? (\n' +
            '                    <SpecialCard\n' +
            '                        title="Donations"\n' +
            '                        subtitle="Thank you for going VIP."\n' +
            '                        description="Your perks are unlocked automatically. Reach support via the Discordmaxxer Discord."\n' +
            '                        cardImage=""\n' +
            '                        backgroundImage=""\n' +
            '                        backgroundColor="#1a3a1a"\n' +
            '                    >\n' +
            '                        <DonateButtonComponent />\n' +
            '                    </SpecialCard>\n' +
            '                )\n' +
            '                : (\n' +
            '                    <SpecialCard\n' +
            '                        title="Get more out of Discordmaxxer"\n' +
            '                        description="Unlock VIP themes, video backgrounds, and tier-locked plugins. Visit discordmaxxer.dev/vip for the full ladder."\n' +
            '                        cardImage=""\n' +
            '                        backgroundImage=""\n' +
            '                        backgroundColor="#1a0e2e"\n' +
            '                    >\n' +
            '                        <DonateButtonComponent />\n' +
            '                    </SpecialCard>\n' +
            '                )\n' +
            '            }',
        replace: '            <DiscordmaxxerVipCard />'
    },

    // ── Round 2 user-visible Vencord strings caught during rc3 testing ──
    // CloudTab "Vencord comes with a cloud integration..."
    {
        file: "src/components/settings/tabs/sync/CloudTab.tsx",
        find: 'Vencord comes with a cloud integration that adds goodies like settings sync across devices.',
        replace: 'Discordmaxxer comes with a cloud integration that adds goodies like settings sync across devices.'
    },
    // BackupAndRestoreTab.tsx — both Vencord references on the same panel
    {
        file: "src/components/settings/tabs/sync/BackupAndRestoreTab.tsx",
        find: 'You can import and export your Vencord settings as a JSON file.',
        replace: 'You can import and export your Discordmaxxer settings as a JSON file.'
    },
    {
        file: "src/components/settings/tabs/sync/BackupAndRestoreTab.tsx",
        find: 'or recover your settings after reinstalling Vencord or Discord.',
        replace: 'or recover your settings after reinstalling Discordmaxxer or Discord.'
    },
    // ContributorModal "Vencord in other ways"
    {
        file: "src/components/settings/tabs/plugins/ContributorModal.tsx",
        find: 'This person has not made any plugins. They likely {ContributedHyperLink} to Vencord in other ways!',
        replace: 'This person has not made any plugins. They likely {ContributedHyperLink} to the Vencord engine that powers Discordmaxxer in other ways!'
    },
    // Plugins tab "required for Vencord to function"
    {
        file: "src/components/settings/tabs/plugins/index.tsx",
        find: '? "This plugin is required for Vencord to function."',
        replace: '? "This plugin is required for Discordmaxxer to function."'
    }
];

let patched = 0;
let skipped = 0;
const warnings = [];

for (const p of PATCHES) {
    const path = join(VENCORD_SRC, p.file);
    if (!existsSync(path)) {
        warnings.push(`File not found: ${p.file}`);
        continue;
    }
    let content = readFileSync(path, "utf-8");

    if (content.includes(p.replace) && !content.includes(p.find)) {
        skipped++;
        continue;
    }

    if (!content.includes(p.find)) {
        warnings.push(`Patch target not found in ${p.file}: "${p.find.slice(0, 60)}..."`);
        continue;
    }

    content = content.split(p.find).join(p.replace);
    writeFileSync(path, content);
    patched++;
    console.log(`[rebrand] ✓ ${p.file}: "${p.find.slice(0, 50)}..." → "${p.replace.slice(0, 50)}..."`);
}

console.log(`\n[rebrand] applied=${patched} skipped(idempotent)=${skipped} warnings=${warnings.length}`);
for (const w of warnings) console.warn(`[rebrand] ⚠ ${w}`);
