/* Probe current theme-color state on the open popout AND look for the
 * "full profile" view container (the modal that opens after clicking a
 * user's name → "View Full Profile"). Goal: find DOM shape so we can wire
 * banner/avatar/theme in the full-profile view too. */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

const out = await page.evaluate(() => {
    const rect = (e) => {
        const r = e.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    const result = {};

    // Theme color state on the existing popout (if open).
    const popout = document.querySelector(".user-profile-popout");
    if (popout) {
        result.popoutInlineStyle = popout.getAttribute("style")?.slice(0, 500) ?? "";
        const cs = getComputedStyle(popout);
        result.popoutComputedPrimary = cs.getPropertyValue("--profile-gradient-primary-color");
        result.popoutComputedBg = cs.backgroundImage.slice(0, 200);
        result.popoutComputedBgColor = cs.backgroundColor;
    } else {
        result.popoutInlineStyle = "(no popout open)";
    }

    // Full-profile view = the modal/page that shows up when you click into
    // someone's profile fully. Look for likely containers.
    const probeSelectors = [
        '[class*="userProfileModal"]',
        '[class*="fullProfile"]',
        '[class*="profileColors"]',
        '[class*="UserProfilePanel"]',
        '[class*="userPanel"]',
        '[role="dialog"]',
        '[aria-label*="profile" i]'
    ];
    const candidates = [];
    for (const sel of probeSelectors) {
        const els = document.querySelectorAll(sel);
        els.forEach(e => {
            candidates.push({
                selector: sel,
                tag: e.tagName,
                cls: typeof e.className === "string" ? e.className.slice(0, 100) : "(non-string)",
                rect: rect(e)
            });
        });
    }
    result.candidates = candidates.slice(0, 20);

    // Broad scan: every class token containing "Profile" with elements >300px wide.
    const wideProfile = [];
    document.querySelectorAll("[class]").forEach(el => {
        const cn = typeof el.className === "string" ? el.className : "";
        if (!/[pP]rofile/.test(cn) && !/[pP]anel/.test(cn)) return;
        const r = el.getBoundingClientRect();
        if (r.width >= 300 && r.height >= 200) {
            wideProfile.push({ tag: el.tagName, cls: cn.slice(0, 100), rect: rect(el) });
        }
    });
    result.wideProfilePanels = wideProfile.slice(0, 15);

    return result;
});

console.log(JSON.stringify(out, null, 2));
await browser.disconnect();
process.exit(0);
