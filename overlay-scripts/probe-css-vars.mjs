import puppeteer from "puppeteer-core";

const b = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await b.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

const result = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const allProps = Array.from(document.styleSheets)
        .flatMap(s => { try { return Array.from(s.cssRules); } catch { return []; } })
        .flatMap(r => r.cssText ? [r.cssText] : []);

    // Pull all CSS custom prop names defined on :root
    const propsOnRoot = new Set();
    const rootStyle = document.documentElement.style;
    // walk computed style — limited but works
    const candidates = [
        "--brand", "--brand-experiment", "--brand-500", "--brand-experiment-500",
        "--brand-experiment-600", "--brand-experiment-560",
        "--button-primary-background", "--button-secondary-background",
        "--button-positive-background", "--button-positive-background-hover",
        "--button-filled-brand-background",
        "--button-filled-brand-background-hover",
        "--background-accent", "--text-link",
        "--mention-foreground", "--mention-background",
        "--info-help-foreground", "--status-positive-foreground"
    ];
    const values = {};
    for (const c of candidates) {
        const v = cs.getPropertyValue(c).trim();
        if (v) values[c] = v;
    }

    // Also try to find a button or accent and check its background
    const sendBtn = document.querySelector('button[type="submit"]') ?? document.querySelector('button[class*="lookFilled"]');
    const sendBtnBg = sendBtn ? getComputedStyle(sendBtn).backgroundColor : null;
    const sendBtnClass = sendBtn ? String(sendBtn.className).slice(0, 120) : null;

    return { values, sendBtnBg, sendBtnClass };
});

console.log(JSON.stringify(result, null, 2));
b.disconnect();
