/* Probe full-profile-view DOM AND find the element rendering Discord's
 * profile gradient (so we can target it for theme color overrides). */
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

    // Find anything that paints a linear-gradient using profile vars on its
    // background-image. Walk every element, check computed style.
    const gradientPainters = [];
    const profilePainters = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundImage;
        if (bg && bg.includes("linear-gradient")) {
            const r = el.getBoundingClientRect();
            if (r.width > 100 && r.height > 50) {
                gradientPainters.push({
                    tag: el.tagName,
                    cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
                    rect: rect(el),
                    bg: bg.slice(0, 200)
                });
            }
        }
        // Look for elements whose background-color resolves to our injected
        // primary color (the popout-injected rgb(77,28,18) we already saw).
        if (cs.backgroundColor === "rgb(77, 28, 18)") {
            profilePainters.push({
                tag: el.tagName,
                cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
                rect: rect(el)
            });
        }
    }
    result.gradientPainters = gradientPainters.slice(0, 15);
    result.profilePainters = profilePainters.slice(0, 10);

    // Full profile view probe — look for the modal that opens via "View Full Profile".
    // Common modern Discord shapes: aria-label, role=dialog, fullProfile class.
    const probeSelectors = [
        '[class*="userProfileOuterUnthemed"]',
        '[class*="userProfileOuter"]',
        '[class*="userProfileModal"]',
        '[class*="profileColors"]',
        '[class*="profileBody"]',
        '[class*="modalRoot"]',
        '[class*="root_"]',
        '[role="dialog"]'
    ];
    const candidates = [];
    for (const sel of probeSelectors) {
        document.querySelectorAll(sel).forEach(e => {
            const r = e.getBoundingClientRect();
            if (r.width < 200) return; // skip tiny dialogs
            candidates.push({
                selector: sel,
                tag: e.tagName,
                cls: typeof e.className === "string" ? e.className.slice(0, 100) : "",
                rect: rect(e)
            });
        });
    }
    result.fullProfileCandidates = candidates;

    // Look for the BIG avatar (full profile typically shows a larger avatar)
    const bigAvatars = [];
    document.querySelectorAll("img[class*='avatar']").forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width >= 100) {
            bigAvatars.push({
                tag: el.tagName,
                cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
                rect: rect(el),
                src: (el).src?.slice(0, 80)
            });
        }
    });
    result.bigAvatars = bigAvatars;

    // Look for the BIG banner in full profile (popout banner was 300×105;
    // full profile banner is typically ~680×272 or similar).
    const bigBanners = [];
    document.querySelectorAll('[class*="banner"]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width >= 400 && r.height >= 80) {
            bigBanners.push({
                tag: el.tagName,
                cls: typeof el.className === "string" ? el.className.slice(0, 80) : "",
                rect: rect(el)
            });
        }
    });
    result.bigBanners = bigBanners;

    return result;
});

console.log(JSON.stringify(out, null, 2));
await browser.disconnect();
process.exit(0);
