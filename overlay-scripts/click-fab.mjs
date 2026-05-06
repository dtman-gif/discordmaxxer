import puppeteer from "puppeteer-core";

const b = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await b.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

await page.evaluate(() => document.getElementById("dm-hub-fab")?.click());
console.log("Clicked DM FAB");

b.disconnect();
