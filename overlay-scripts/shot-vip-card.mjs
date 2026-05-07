/* Quick: open settings, navigate to Discordmaxxer tab, screenshot the VIP card */
import puppeteer from "puppeteer-core";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const label = process.argv[2] || "vipcard";

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];
console.log("on", page.url());

const start = Date.now();
while (Date.now() - start < 30000) {
    const ready = await page.evaluate(() =>
        !!(globalThis.Vencord?.Plugins && Object.keys(Vencord.Plugins.plugins).length > 0));
    if (ready) break;
    await sleep(500);
}

await page.evaluate(() => {
    Vencord.Webpack.Common.SettingsRouter.openUserSettings("my_account_panel");
});
await sleep(1500);

await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('[role="listitem"][class*="item_"]'));
    const dm = items.find(el => (el.textContent ?? "").trim() === "Discordmaxxer");
    if (dm) dm.click();
});
await sleep(1500);

const path = `overlay-scripts/screenshots/vip-${label}.png`;
await page.screenshot({ path, type: "png" });
console.log("→", path);
await browser.disconnect();
