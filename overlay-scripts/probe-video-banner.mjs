/* Diagnose why the video banner isn't showing. Inspect every banner element,
 * the video child (if any), and its load state. */
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

// Listen for console errors / warnings to catch CSP / network failures.
page.on("console", msg => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
        console.log(`[browser ${type}] ${msg.text().slice(0, 300)}`);
    }
});
page.on("pageerror", err => console.log(`[pageerror] ${err.message.slice(0, 300)}`));

const out = await page.evaluate(() => {
    const rect = (e) => {
        const r = e.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    const result = { banners: [] };

    document.querySelectorAll('[class*="banner__"]').forEach(banner => {
        const r = banner.getBoundingClientRect();
        if (r.width < 200 || r.height < 50) return;
        const cs = getComputedStyle(banner);
        const entry = {
            bannerTag: banner.tagName,
            bannerCls: banner.className.slice(0, 60),
            bannerRect: rect(banner),
            bannerBgImage: cs.backgroundImage.slice(0, 200),
            bannerPosition: cs.position,
            bannerInlineStyle: banner.getAttribute("style")?.slice(0, 300) ?? "",
            videoChild: null,
            allChildren: []
        };
        // List all direct children to see what's in there.
        Array.from(banner.children).forEach(c => {
            const el = c;
            entry.allChildren.push({
                tag: el.tagName,
                cls: typeof el.className === "string" ? el.className.slice(0, 50) : "",
                rect: rect(el),
                src: (el).src?.slice(0, 100) ?? "",
                style: el.getAttribute("style")?.slice(0, 200) ?? ""
            });
        });
        const v = banner.querySelector("video.dm-flair-banner-video");
        if (v) {
            const video = v;
            const vcs = getComputedStyle(video);
            entry.videoChild = {
                src: video.src,
                currentSrc: video.currentSrc,
                readyState: video.readyState,
                networkState: video.networkState,
                paused: video.paused,
                error: video.error ? { code: video.error.code, msg: video.error.message } : null,
                rect: rect(video),
                computed: {
                    display: vcs.display,
                    visibility: vcs.visibility,
                    opacity: vcs.opacity,
                    zIndex: vcs.zIndex,
                    position: vcs.position
                }
            };
        }
        result.banners.push(entry);
    });

    return result;
});

console.log(JSON.stringify(out, null, 2));

// Wait briefly to catch any console messages that came during evaluate.
await new Promise(r => setTimeout(r, 1000));

await browser.disconnect();
process.exit(0);
