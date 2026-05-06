import puppeteer from "puppeteer-core";

const b = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await b.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

const result = await page.evaluate(() => {
    const v = globalThis.Vencord;

    // 1) Real toggle test on a setting we know is currently OFF.
    const plugin = "VideoBackground";
    const key = "enable";
    const wasInitial = v.PlainSettings?.plugins?.[plugin]?.[key];

    // Toggle: if OFF, flip to ON; if ON, flip to OFF. Then back to original.
    const target = !wasInitial;
    let writeOk = false;
    try {
        v.Settings.plugins[plugin][key] = target;
        writeOk = true;
    } catch (e) {}
    const afterFirst = v.PlainSettings?.plugins?.[plugin]?.[key];

    // Restore original
    try {
        v.Settings.plugins[plugin][key] = wasInitial;
    } catch (e) {}
    const afterRestore = v.PlainSettings?.plugins?.[plugin]?.[key];

    // 2) Trace upward from mic button to find the user-panel "actions" row.
    const mic = document.querySelector('button[aria-label*="ute" i]');
    const trace = [];
    let n = mic;
    while (n && trace.length < 6) {
        trace.push({
            tag: n.tagName,
            className: String(n.className).slice(0, 100),
            childCount: n.children.length,
            ariaLabel: n.getAttribute?.("aria-label") ?? null
        });
        n = n.parentElement;
    }

    // 3) Locate the avatar+username block and the actions row separately
    const avatarRoot = document.querySelector('[class*="avatarWrapper"]');
    const avatarTrace = [];
    let av = avatarRoot;
    while (av && avatarTrace.length < 5) {
        avatarTrace.push({
            tag: av.tagName,
            className: String(av.className).slice(0, 100),
            childCount: av.children?.length ?? 0
        });
        av = av.parentElement;
    }

    return {
        toggleTest: { plugin, key, wasInitial, target, writeOk, afterFirst, afterRestore, sticksUnderProxy: afterFirst === target },
        micTrace: trace,
        avatarTrace
    };
});

console.log(JSON.stringify(result, null, 2));
b.disconnect();
