/* Probe DMProfileFlair diagnostics + screenshot the debug widget.
 * Run AFTER electron is up with --remote-debugging-port=9222 AND you've
 * opened a profile popout in Discord. */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
console.log("[probe] pages:", pages.map(p => p.url()));

const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];
console.log("[probe] using page:", page.url());

// Dump diagnostics text from the widget directly (sidesteps any copy issue).
const widgetText = await page.evaluate(() => {
    const w = document.getElementById("dm-flair-debug");
    return w ? w.innerText : "(widget not found)";
});
console.log("--- WIDGET TEXT ---");
console.log(widgetText);
console.log("--- END ---");

// Also dump the raw probe report from window-scoped diagnostics if accessible.
// (Module-private — only readable via the widget for now.)

// Take a screenshot of just the widget.
const widget = await page.$("#dm-flair-debug");
if (widget) {
    const buf = await widget.screenshot({ omitBackground: true });
    const out = "C:\\Users\\Diggy\\projects\\discordmaxxer\\overlay-scripts\\screenshots\\flair-widget.png";
    writeFileSync(out, buf);
    console.log("[probe] saved screenshot:", out);
} else {
    console.log("[probe] widget element not found in DOM");
}

// Also dump key DOM samples for popout-related elements right now.
const domDump = await page.evaluate(() => {
    const buckets = ["popout", "Popout", "profile", "Profile", "userPanel", "banner", "Banner"];
    const out = {};
    for (const b of buckets) {
        const els = document.querySelectorAll(`[class*="${b}"]`);
        out[b] = {
            count: els.length,
            samples: [...els].slice(0, 5).map(e => ({
                tag: e.tagName,
                className: typeof e.className === "string" ? e.className.slice(0, 100) : "(non-string)",
                rect: e.getBoundingClientRect ? (() => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; })() : "(no rect)"
            }))
        };
    }
    out.dataUserId = {
        count: document.querySelectorAll("[data-user-id]").length,
        samples: [...document.querySelectorAll("[data-user-id]")].slice(0, 3).map(e => ({
            tag: e.tagName,
            userId: e.getAttribute("data-user-id"),
            className: typeof e.className === "string" ? e.className.slice(0, 60) : "(non-string)"
        }))
    };
    return out;
});
console.log("--- DOM DUMP ---");
console.log(JSON.stringify(domDump, null, 2));

// Broader probe: surface ALL data-* attribute names + class tokens that could
// plausibly identify a user-popout-like element. Pick up modern Discord's
// renamed attributes.
const broad = await page.evaluate(() => {
    // Sample all elements; collect unique data-* attribute names + frequency.
    const dataAttrFreq = {};
    const userishClasses = new Set();
    const all = document.querySelectorAll("*");
    let scanned = 0;
    for (const el of all) {
        scanned++;
        // data-* attributes
        for (const attr of el.attributes) {
            if (attr.name.startsWith("data-")) {
                dataAttrFreq[attr.name] = (dataAttrFreq[attr.name] || 0) + 1;
            }
        }
        // class tokens containing user/User
        if (typeof el.className === "string") {
            for (const tok of el.className.split(/\s+/)) {
                if (/user/i.test(tok) || /member/i.test(tok) || /profile/i.test(tok) || /popout/i.test(tok)) {
                    userishClasses.add(tok.slice(0, 40));
                }
            }
        }
    }
    // Sort attrs by freq, top 20
    const topAttrs = Object.entries(dataAttrFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
    return {
        totalScanned: scanned,
        topDataAttrs: topAttrs,
        userishClasses: [...userishClasses].sort()
    };
});
console.log("--- BROAD DOM SCAN ---");
console.log("scanned elements:", broad.totalScanned);
console.log("top data-* attributes by frequency:");
for (const [k, v] of broad.topDataAttrs) console.log(`  ${k}: ${v}`);
console.log("user/member/profile/popout class tokens found:");
for (const c of broad.userishClasses) console.log(`  ${c}`);

await browser.disconnect();
process.exit(0);
