/* Probe whether DiscordmaxxerBadge is registered + screenshot the user popout. */

import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({ browserURL: "http://localhost:9222", defaultViewport: null });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("discord.com")) ?? pages[0];

const result = await page.evaluate(() => {
    const v = (globalThis).Vencord;
    const me = v?.Webpack?.Common?.UserStore?.getCurrentUser?.();

    // The Badges API stores registrations in an internal Set. We can't read it
    // directly, but _getBadges is exposed and we can call it for ourselves.
    const myBadges = v?.Api?.Badges?._getBadges?.({ userId: me?.id, guildId: undefined });

    const dmBadge = myBadges?.find(b => b.id === "discordmaxxer-user");

    return {
        myUserId: me?.id ?? null,
        totalBadgesForMe: myBadges?.length ?? 0,
        dmBadgePresent: !!dmBadge,
        dmBadgeMeta: dmBadge && {
            id: dmBadge.id,
            description: dmBadge.description,
            iconSrcPrefix: dmBadge.iconSrc?.slice(0, 80) ?? null
        }
    };
});

console.log(JSON.stringify(result, null, 2));
browser.disconnect();
