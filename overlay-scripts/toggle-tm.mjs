/* One-shot: toggle TournamentMode on (or off with --off) via plugin restart. */
import puppeteer from "puppeteer-core";

const off = process.argv.includes("--off");
const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

const result = await page.evaluate(async (turnOff) => {
    const p = Vencord.Plugins.plugins.TournamentMode;
    if (!p) return { error: "TournamentMode not loaded" };
    Vencord.PlainSettings.plugins.TournamentMode.enabledOnStart = !turnOff;
    if (p.settings?.store) p.settings.store.enabledOnStart = !turnOff;
    try { Vencord.Plugins.stopPlugin(p); } catch {}
    try { Vencord.Plugins.startPlugin(p); } catch {}
    await new Promise(r => setTimeout(r, 800));
    const styleLen = document.getElementById("dm-tournament-mode")?.textContent?.length ?? 0;
    return { ok: true, enabledOnStart: !turnOff, styleLen };
}, off);

console.log(JSON.stringify(result, null, 2));
browser.disconnect();
