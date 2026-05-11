/* Why isn't the avatar swap catching? Probe:
 * - Current user's id + Discord-cached avatar URL prefix
 * - Sample of all <img> srcs on the page
 * - Count of imgs matching the user-id needle
 */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

const out = await page.evaluate(() => {
    const result = {};

    // Try to get current user via Vencord's UserStore.
    let userId = null;
    try {
        const Vencord = globalThis.Vencord;
        const UserStore = Vencord?.Webpack?.Common?.UserStore;
        const me = UserStore?.getCurrentUser?.();
        result.userStoreFound = !!UserStore;
        result.getCurrentUserType = typeof UserStore?.getCurrentUser;
        if (me) {
            userId = me.id;
            result.me = {
                id: me.id,
                username: me.username,
                avatar: me.avatar,
                discriminator: me.discriminator
            };
        }
    } catch (e) {
        result.userStoreError = String(e);
    }

    // Inventory ALL imgs with src.
    const allImgs = document.querySelectorAll("img");
    const srcsByOrigin = {};
    let imgsWithSrc = 0;
    const sampleSrcs = [];
    allImgs.forEach((img, i) => {
        const src = img.currentSrc || img.src || "";
        if (!src) return;
        imgsWithSrc++;
        let origin = "(unknown)";
        try { origin = new URL(src).hostname; } catch {}
        srcsByOrigin[origin] = (srcsByOrigin[origin] || 0) + 1;
        if (i < 6 || src.includes("avatar")) sampleSrcs.push(src.slice(0, 120));
    });
    result.imgsWithSrc = imgsWithSrc;
    result.srcsByOrigin = srcsByOrigin;
    result.sampleSrcs = sampleSrcs.slice(0, 15);

    // If we know userId, count how many imgs match the needle.
    if (userId) {
        const needle = `/avatars/${userId}/`;
        let matches = 0;
        const matchingSrcs = [];
        document.querySelectorAll("img").forEach(img => {
            const src = img.currentSrc || img.src || "";
            if (src.includes(needle)) {
                matches++;
                if (matchingSrcs.length < 5) matchingSrcs.push(src.slice(0, 120));
            }
        });
        result.needle = needle;
        result.needleMatches = matches;
        result.matchingSrcs = matchingSrcs;
    }

    // What does the plugin's diagnostics say?
    const dbg = document.getElementById("dm-flair-debug");
    result.debugWidgetText = dbg ? dbg.innerText.slice(0, 500) : "(widget not mounted)";

    return result;
});

console.log(JSON.stringify(out, null, 2));
await browser.disconnect();
process.exit(0);
