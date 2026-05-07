/*
 * Discordmaxxer — programmatic first-launch wizard submitter
 * Connects to CDP @ :9222, finds the first-launch page, submits the form
 * with default-friendly choices, then waits for the Discord page to appear.
 */
import puppeteer from "puppeteer-core";
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const wizard = pages.find(p => p.url().includes("first-launch.html"));
if (!wizard) {
    console.log("[skip-wizard] no first-launch page found — already past it?");
    await browser.disconnect();
    process.exit(0);
}
console.log("[skip-wizard] found wizard at", wizard.url());
await wizard.evaluate(() => {
    document.querySelector('select[name="discordBranch"]').value = "stable";
    document.querySelector('input[name="autoStart"]').checked = false;
    document.querySelector('input[name="richPresence"]').checked = true;
    document.querySelector('input[name="importSettings"]').checked = true;
    document.querySelector('input[name="minimizeToTray"]').checked = true;
    document.querySelector('input[name="skipTips"]').checked = true;
    document.getElementById("submit").click();
});
console.log("[skip-wizard] submitted, waiting for Discord page…");

const start = Date.now();
let discord = null;
while (Date.now() - start < 60000) {
    const ps = await browser.pages();
    discord = ps.find(p => p.url().includes("discord.com"));
    if (discord) break;
    await sleep(800);
}
if (!discord) { console.log("[skip-wizard] Discord page never appeared"); process.exit(1); }
console.log("[skip-wizard] Discord page up at", discord.url());
await browser.disconnect();
