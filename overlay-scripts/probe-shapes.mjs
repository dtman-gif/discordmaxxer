/* Probe Vencord internal shapes so validate-all.mjs uses correct paths. */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

const shapes = await page.evaluate(() => {
    const out = {};

    // Plugins API
    const plugApi = Vencord.Plugins;
    out.pluginsApiKeys = Object.keys(plugApi).slice(0, 40);
    out.hasStartPlugin = typeof plugApi.startPlugin;
    out.hasStopPlugin = typeof plugApi.stopPlugin;
    out.hasStart = typeof plugApi.start;
    out.hasStop = typeof plugApi.stop;

    // DiscordmaxxerBadge plugin shape
    const p = plugApi.plugins.DiscordmaxxerBadge;
    out.badgePluginKeys = Object.keys(p ?? {});
    out.badgeOptionsKeys = Object.keys(p?.options ?? {});
    out.badgeSettingsKeys = Object.keys(p?.settings ?? {});
    if (p?.settings?.def) {
        out.badgeSettingsDefKeys = Object.keys(p.settings.def);
        const def0 = p.settings.def.customStatusOnce;
        out.customStatusOnceDef = {
            type: def0?.type,
            hasOnChange: typeof def0?.onChange,
            default: def0?.default
        };
    }
    if (p?.settings?.store) {
        out.badgeStoreKeys = Object.keys(p.settings.store);
        out.customStatusOnceValue = p.settings.store.customStatusOnce;
    }

    // Badges API
    const ba = Vencord.Api?.Badges ?? Vencord.Plugins.plugins.DiscordmaxxerBadge?._badges;
    out.badgesApiKeys = Object.keys(Vencord.Api?.Badges ?? {});
    // Try to find the real exported list
    const allFunctions = Object.entries(Vencord.Api?.Badges ?? {})
        .map(([k, v]) => ({ k, type: typeof v }))
        .slice(0, 30);
    out.badgesApiTypes = allFunctions;

    // Look for our badge object by id
    const candidatePaths = [
        Vencord.Api?.Badges?._badges,
        Vencord.Api?.Badges?.Badges,
        Vencord.Api?.Badges?.badges
    ];
    out.candidateShape = candidatePaths.map(c => c ? Array.isArray(c) ? `array[${c.length}]` : `obj keys=${Object.keys(c).slice(0, 5).join(",")}` : "nullish");

    // Settings store shape — Vencord may proxy via getter/setter, check own descriptor
    if (p?.settings?.store) {
        const desc = Object.getOwnPropertyDescriptor(p.settings.store, "customStatusOnce");
        out.storePropDescriptor = desc ? Object.keys(desc) : "no descriptor";
    }

    // PlainSettings shape
    out.plainSettingsBadge = Vencord.PlainSettings?.plugins?.DiscordmaxxerBadge;

    // Try a profile fetch to see error shape
    return out;
});

console.log(JSON.stringify(shapes, null, 2));

// Now do the profile fetch separately to see error
const profErr = await page.evaluate(async () => {
    try {
        const r = await Vencord.Webpack.Common.RestAPI.get({ url: "/users/@me/profile" });
        return { ok: true, body: r?.body };
    } catch (e) {
        return {
            err: true,
            message: e?.message,
            status: e?.status,
            keys: Object.keys(e ?? {}),
            stringify: JSON.stringify(e, Object.getOwnPropertyNames(e ?? {})).slice(0, 500)
        };
    }
});
console.log("\n--- PROFILE FETCH SHAPE ---");
console.log(JSON.stringify(profErr, null, 2));

// And try with_mutual_guilds=false param (Discord may need it)
const profAlt = await page.evaluate(async () => {
    try {
        const me = Vencord.Webpack.Common.UserStore.getCurrentUser();
        const r = await Vencord.Webpack.Common.RestAPI.get({ url: `/users/${me.id}/profile?with_mutual_guilds=false` });
        return { ok: true, body: r?.body ? Object.keys(r.body) : null };
    } catch (e) {
        return { err: e?.message ?? String(e), status: e?.status };
    }
});
console.log("\n--- PROFILE ALT FETCH ---");
console.log(JSON.stringify(profAlt, null, 2));

browser.disconnect();
