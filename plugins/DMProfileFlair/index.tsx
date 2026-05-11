/*
 * Discordmaxxer — DMProfileFlair plugin (Channels E, F, G)
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * User-set custom profile flair, visible only to other Discordmaxxer clients
 * (same architecture as DiscordmaxxerBadge Channel A — fetched from the public
 * tier roster, rendered client-side, vanilla Discord never sees it).
 *
 *   E) Custom banner — image or short MP4 URL, replaces Discord's banner
 *      in profile popouts. Requires MAXXER.
 *   F) Animated avatar — GIF/MP4 URL, replaces the avatar in popouts (P2)
 *      and member list + chat (P5). Requires MAXXER+. Suppressed when
 *      TournamentMode is active (animated content tanks FPS).
 *   G) Theme colors — primary + secondary hex, patched into Discord's
 *      --profile-gradient-*-color CSS vars on the popout root. Requires
 *      MAXXER++.
 *
 * Phasing:
 *   - This file ships the plumbing: settings UI, worker write call, viewer
 *     toggles, TM state helper, effective-flair accessor. Render hooks for
 *     each channel land in follow-up commits.
 *
 * Anti-abuse:
 *   - URLs validated client- AND worker-side (https://, ≤250 chars).
 *   - Viewer toggle defaults ON; per-user "hide flair" right-click action
 *     populates a local block list (P5).
 *   - Worker enforces per-field tier gating so client gating can't be
 *     bypassed by editing this plugin's JS.
 */

import { definePluginSettings } from "@api/Settings";
import { managedStyleRootNode } from "@api/Styles";
import { createAndAppendStyle } from "@utils/css";
import definePlugin, { OptionType } from "@utils/types";
import { Button, React, Toasts, UserStore } from "@webpack/common";

import { getRosterProfileFlair, ProfileFlair } from "../_dm-shared/roster";
import { Tier } from "../_dm-shared/vip";
import { readBinding } from "../_dm-shared/vipClaim";

const WORKER_PROFILE_URL = "https://optmaxxing-vip.maxxtopia.workers.dev/profile";

const PROFILE_FIELD_MIN_TIER: Record<keyof ProfileFlair, Tier> = {
    bannerUrl: Tier.MAXXER,
    avatarAnimatedUrl: Tier.MAXXER_PLUS,
    themeColorPrimary: Tier.MAXXER_PLUS_PLUS,
    themeColorSecondary: Tier.MAXXER_PLUS_PLUS
};

const URL_RE = /^https:\/\/[^\s]{1,250}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function toast(msg: string, type: any = Toasts.Type.SUCCESS, durationMs = 3000) {
    Toasts.show({
        message: msg,
        type,
        id: Toasts.genId(),
        options: { duration: durationMs, position: Toasts.Position.TOP }
    });
}

/** TournamentMode integration: read the plugin's manuallyActive flag through
 *  Vencord's plain-settings tree. Used to suppress animated content (banner
 *  videos + animated avatars) when the user is gaming — TM exists exactly to
 *  free up CPU/GPU, so adding animated avatar decodes back into the mix would
 *  defeat the point. */
export function isTournamentModeActive(): boolean {
    return !!(globalThis as any).Vencord?.PlainSettings?.plugins?.TournamentMode?.manuallyActive;
}

/** Local hide list — userIds whose flair the viewer has muted. Stored in
 *  localStorage so a right-click "hide flair" survives restarts. */
const HIDE_LIST_KEY = "dm-profile-flair-hidden";
function readHideList(): Set<string> {
    try {
        const raw = localStorage.getItem(HIDE_LIST_KEY);
        if (!raw) return new Set();
        const arr = JSON.parse(raw);
        return new Set(Array.isArray(arr) ? arr.filter(x => typeof x === "string") : []);
    } catch {
        return new Set();
    }
}
function writeHideList(set: Set<string>): void {
    try { localStorage.setItem(HIDE_LIST_KEY, JSON.stringify([...set])); } catch {}
}
export function isFlairHiddenForUser(userId: string): boolean {
    return readHideList().has(userId);
}
export function toggleHideFlairForUser(userId: string): boolean {
    const set = readHideList();
    if (set.has(userId)) set.delete(userId);
    else set.add(userId);
    writeHideList(set);
    return set.has(userId);
}

/** Single point all render hooks call to decide what (if anything) to render
 *  for a given user. Returns null when nothing should render — viewer toggles
 *  off, user in hide list, user not on roster, or no flair set. The `kind`
 *  arg lets the helper apply per-channel gates (TM suppresses animated; the
 *  viewer toggle is per-channel). */
export function getEffectiveFlairForUser(
    userId: string,
    kind: "banner" | "avatar" | "theme"
): ProfileFlair | null {
    const s = settings.store;
    if (!s.showOthersFlair) return null;
    if (kind === "banner" && !s.showOthersBanner) return null;
    if (kind === "avatar" && !s.showOthersAvatar) return null;
    if (kind === "theme" && !s.showOthersThemeColors) return null;
    if (isFlairHiddenForUser(userId)) return null;

    // Self-preview path: when rendering YOUR OWN popout, prefer the local
    // setter-side settings over the roster lookup. Lets you see your flair
    // change as soon as you type a URL — no save, no worker, no claim, no
    // roster cache wait. Renders only the fields you've filled in locally;
    // empty fields fall through to roster (which may have a previously
    // saved version) and then to nothing.
    let flair: ProfileFlair | null = null;
    const me = UserStore.getCurrentUser?.();
    if (me?.id === userId) {
        const local: ProfileFlair = {};
        const b = s.myBannerUrl.trim(); if (b) local.bannerUrl = b;
        const a = s.myAvatarAnimatedUrl.trim(); if (a) local.avatarAnimatedUrl = a;
        const p = s.myThemeColorPrimary.trim(); if (p) local.themeColorPrimary = p;
        const sc = s.myThemeColorSecondary.trim(); if (sc) local.themeColorSecondary = sc;
        if (Object.keys(local).length) flair = local;
    }
    if (!flair) flair = getRosterProfileFlair(userId) ?? null;
    if (!flair) return null;

    if ((kind === "banner" || kind === "avatar") && isTournamentModeActive()) {
        // Animated content is the whole point of TM suppression — even a
        // banner image is technically a network fetch + decode we don't
        // want during a match. Theme colors are free, so they stay.
        return null;
    }
    return flair;
}

async function postFlairUpdate(profile: Partial<ProfileFlair>, replace: boolean): Promise<boolean> {
    const me = UserStore.getCurrentUser();
    if (!me?.id) {
        toast("Couldn't read your Discord user ID", Toasts.Type.FAILURE);
        return false;
    }
    // Modern Discord nukes window.localStorage to prevent token theft from
    // injected scripts. That means readBinding() (which reads from localStorage)
    // returns null even after a successful claim. Fall through to the plugin's
    // own `manualClaimCode` setting which IS persisted (Vencord writes settings
    // to disk via main process, independent of localStorage).
    let claimCode = "";
    const binding = readBinding();
    if (binding?.code) {
        claimCode = binding.code;
    } else if (settings.store.manualClaimCode?.trim()) {
        claimCode = settings.store.manualClaimCode.trim().toUpperCase().replace(/-/g, "");
    }
    if (!claimCode) {
        toast(
            "Need your VIP claim code — paste it into 'manualClaimCode' in this plugin's settings, or claim one via DiscordmaxxerVipClaim first.",
            Toasts.Type.FAILURE, 6000
        );
        return false;
    }
    try {
        const res = await fetch(WORKER_PROFILE_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                userId: me.id,
                claimCode,
                profile,
                replace
            })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            toast(`Save failed: ${body?.error ?? res.status}`, Toasts.Type.FAILURE, 5000);
            return false;
        }
        toast("✅ Profile flair saved — other Discordmaxxer users see it within ~5 min");
        return true;
    } catch (e) {
        console.warn("[DMProfileFlair] save failed:", e);
        toast(`Save failed: ${(e as any)?.message ?? "network"}`, Toasts.Type.FAILURE, 5000);
        return false;
    }
}

function validateLocal(profile: Partial<ProfileFlair>): string | null {
    for (const [k, v] of Object.entries(profile)) {
        if (!v) continue;
        if (k === "bannerUrl" || k === "avatarAnimatedUrl") {
            if (!URL_RE.test(v as string)) return `${k} must be https:// and ≤250 chars`;
        }
        // Color fields are auto-normalized in onSave (# prefix auto-added),
        // so by the time we reach validation they should already be canonical
        // #RRGGBB. If not — bad input that even normalizeColor couldn't save.
        if (k === "themeColorPrimary" || k === "themeColorSecondary") {
            if (!COLOR_RE.test(v as string)) {
                return `${k} must be a 6-char hex color (e.g. ff0034 or #ff0034 — the # is optional)`;
            }
        }
    }
    return null;
}

function FlairEditor() {
    const s = settings.store;
    const [busy, setBusy] = React.useState(false);

    const onSave = async () => {
        // Normalize colors before sending — the worker validates strict
        // `#RRGGBB`. normalizeColor accepts bare hex, 0x-prefix, 3-digit
        // shorthand, etc and emits canonical lowercase #rrggbb. If a user
        // entered garbage that can't be normalized we let validateLocal
        // surface a friendly error.
        const normalizeForSave = (raw: string): string => {
            const trimmed = raw.trim();
            if (!trimmed) return "";  // empty = clear the field
            const n = normalizeColor(trimmed);
            return n ?? trimmed;       // pass through unchanged so validation catches it
        };
        const proposed: Partial<ProfileFlair> = {
            bannerUrl: s.myBannerUrl.trim() || "",
            avatarAnimatedUrl: s.myAvatarAnimatedUrl.trim() || "",
            themeColorPrimary: normalizeForSave(s.myThemeColorPrimary),
            themeColorSecondary: normalizeForSave(s.myThemeColorSecondary)
        };
        const err = validateLocal(proposed);
        if (err) { toast(err, Toasts.Type.FAILURE, 5000); return; }
        setBusy(true);
        // Replace mode: the editor reflects the user's full intended state,
        // so we replace rather than merge — empty fields clear server-side.
        await postFlairUpdate(proposed, true);
        setBusy(false);
    };

    const onClearAll = async () => {
        if (!confirm("Clear all your custom profile flair (banner, avatar, colors)?")) return;
        setBusy(true);
        const ok = await postFlairUpdate({}, true);
        if (ok) {
            s.myBannerUrl = "";
            s.myAvatarAnimatedUrl = "";
            s.myThemeColorPrimary = "";
            s.myThemeColorSecondary = "";
        }
        setBusy(false);
    };

    const wrapStyle: React.CSSProperties = {
        marginTop: 12, padding: "12px 14px",
        background: "rgba(226, 91, 255, 0.05)",
        border: "1px solid rgba(226, 91, 255, 0.25)",
        borderRadius: 8
    };
    const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#fbefff", marginBottom: 8 };
    const noteStyle: React.CSSProperties = { fontSize: 11.5, color: "#cbd0e0", opacity: 0.85, marginBottom: 8 };
    const btnRow: React.CSSProperties = { display: "flex", gap: 8, marginTop: 8 };

    return (
        <div style={wrapStyle}>
            <div style={titleStyle}>🎨 Save your custom flair</div>
            <div style={noteStyle}>
                These values are sent to the Discordmaxxer roster and rendered for other
                Discordmaxxer users. Vanilla Discord users see your stock profile.
                Worker validates each field server-side — banner needs MAXXER, animated
                avatar needs MAXXER+, theme colors need MAXXER++.
            </div>
            <div style={btnRow}>
                <Button size={Button.Sizes.SMALL} color={Button.Colors.BRAND} onClick={onSave} disabled={busy}>
                    💾 Save to Discordmaxxer
                </Button>
                <Button size={Button.Sizes.SMALL} color={Button.Colors.RED} onClick={onClearAll} disabled={busy}>
                    ✕ Clear all my flair
                </Button>
            </div>
        </div>
    );
}

const settings = definePluginSettings({
    // ─── Setter side (your own flair) ─────────────────────────────────────
    myBannerUrl: {
        type: OptionType.STRING,
        description:
            "[Channel E · MAXXER+] DIRECT image URL (not a webpage). " +
            "✅ Good: https://i.imgur.com/abc123.png  ❌ Bad: https://imgur.com/gallery/abc123 (HTML page, won't render). " +
            "On imgur: right-click the image → 'Copy image address' to get the direct URL. " +
            "Recommended size: 600×240 (or any 5:2 ratio — Discord's banner slot is 300×120 in popouts, 680×272 in full profile; 2× pixel density looks crispest). " +
            "Supports png/jpg/webp/gif images OR short mp4/webm videos. ≤5MB image / ≤15MB video recommended.",
        default: ""
    },
    myAvatarAnimatedUrl: {
        type: OptionType.STRING,
        description:
            "[Channel F · MAXXER+] DIRECT image/GIF URL (not a webpage). " +
            "Same rules as banner — right-click → Copy image address to get the right URL. " +
            "Recommended size: 160×160 square (1:1 aspect — Discord renders 80×80 in popouts, 120×120 in full profile; 2× density for crisp). " +
            "Renders in profile popouts, full profile, AND member list + chat + voice + DM headers. " +
            "⚠ IMPORTANT — you must have a CUSTOM Discord avatar set on your account (Discord Settings → My Account → upload anything) " +
            "for the swap to work on member list / chat / voice surfaces. " +
            "Discord's DEFAULT avatars (the colored wordmark) aren't on the per-user CDN path we match against, " +
            "so users on default avatars only get the swap on the profile popout + full-profile view. " +
            "Suppressed when TournamentMode is on.",
        default: ""
    },
    myThemeColorPrimary: {
        type: OptionType.STRING,
        description:
            "[Channel G · MAXXER++] Primary theme color — TOP of the profile gradient. " +
            "Accepts #RRGGBB, RRGGBB (no #), or 0xRRGGBB — auto-normalized. " +
            "Default = '#4d1c12' (deep blood red) so you can see the gradient effect on first launch. " +
            "Clear to remove your gradient.",
        default: "#4d1c12"
    },
    myThemeColorSecondary: {
        type: OptionType.STRING,
        description:
            "[Channel G · MAXXER++] Secondary theme color — BOTTOM of the profile gradient. " +
            "Accepts #RRGGBB, RRGGBB (no #), or 0xRRGGBB — auto-normalized. " +
            "Default = '#ff0034' (vivid red). Paired with the default primary above for a nice red gradient demo.",
        default: "#ff0034"
    },
    manualClaimCode: {
        type: OptionType.STRING,
        description:
            "Optional fallback: paste your VIP claim code (the MAXX-XXXX-XXXX-XXXX-XXXX you redeemed) here " +
            "if Save → 'Save to Discordmaxxer' tells you it can't find your binding. Discord disables " +
            "localStorage in modern builds which breaks the normal binding-read path; this setting is " +
            "persisted to disk via Vencord, so it survives. Auto-normalized (dashes + case ignored).",
        default: ""
    },
    editor: {
        type: OptionType.COMPONENT,
        description: "",
        component: FlairEditor
    },

    // ─── Viewer side (rendering others' flair) ────────────────────────────
    showOthersFlair: {
        type: OptionType.BOOLEAN,
        description:
            "Master toggle — render custom profile flair set by other Discordmaxxer users. " +
            "Default ON. Flip off if you'd rather just see stock Discord profiles for everyone.",
        default: true
    },
    showOthersBanner: {
        type: OptionType.BOOLEAN,
        description: "Render other users' custom banners.",
        default: true
    },
    showOthersAvatar: {
        type: OptionType.BOOLEAN,
        description: "Render other users' animated avatars.",
        default: true
    },
    showOthersThemeColors: {
        type: OptionType.BOOLEAN,
        description: "Render other users' profile gradient colors.",
        default: true
    }
});

// ─── Render hooks ──────────────────────────────────────────────────────────
// MutationObserver finds profile popouts, reads the user inside, applies
// background-image as an inline style directly on the banner element
// (inline `!important` beats every stylesheet rule no matter the specificity).
// No CSS-variable indirection. Diagnostics object surfaces live state in the
// settings panel so we can see what the observer is seeing without devtools.

let style: HTMLStyleElement | null = null;
let observer: MutationObserver | null = null;
let rescanTimer: number | null = null;
let defaultAvatarWarned = false;


/** True if a URL ends in a typical video extension. Used to decide whether to
 *  render as background-image (image) or as a <video> overlay (video). Pure
 *  string heuristic — Content-Type would be more reliable but needs a HEAD
 *  request before render which we'd rather avoid for popout-open latency. */
function isVideoUrl(url: string): boolean {
    return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

/** Wrap an HTTPS video URL through the dm-media:// proxy (registered in
 *  main/dmMediaProxy.ts) to bypass Chromium's Opaque Response Blocking.
 *  ORB blocks cross-origin no-CORS video at the network-service layer
 *  regardless of CSP or response-header injection. The proxy fetches the
 *  bytes from MAIN process (no ORB) and serves them through a same-origin
 *  custom scheme. Already-proxied URLs and non-HTTPS URLs pass through. */
function proxyVideoUrl(url: string): string {
    if (!/^https:\/\//i.test(url)) return url;
    if (url.startsWith("dm-media:")) return url;
    // Use a host segment (`proxy`) because Chromium's <video> URL safety
    // check rejects host-less custom-scheme URLs ("dm-media:///path").
    return `dm-media://proxy/${encodeURIComponent(url)}`;
}

/** True if URL is any animated format (video OR animated image). Drives the
 *  TournamentMode suppression — we want all decode/compositing-cost banners
 *  paused during gaming, not just videos. */
function isAnimatedUrl(url: string): boolean {
    return /\.(mp4|webm|mov|gif|apng)(\?|#|$)/i.test(url);
}

function buildCss(): string {
    return `
        /* Hide Discord's stock banner <img> when we've painted ours over the
           container. The data-attr is set inline by tagPopout. */
        [data-dm-flair-banner-applied] > img:first-child {
            visibility: hidden !important;
        }
        /* Video banner overlay — covers the banner area, click-through, low
           paint cost (one composited surface). */
        .dm-flair-banner-video {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            pointer-events: none;
            z-index: 1;
        }

    `;
}

/** Find all profile banner elements page-wide. Modern Discord uses
 *  `banner__<hash>` (verified `banner__68edb` for both the small popout
 *  banner and the full-profile-view banner). Filter by size to skip small
 *  decorative banner SVGs. */
function findAllProfileBanners(): HTMLElement[] {
    const out: HTMLElement[] = [];
    document.querySelectorAll('[class*="banner__"]').forEach(c => {
        const el = c as HTMLElement;
        const r = el.getBoundingClientRect();
        // Real profile banners are ≥200px wide and ≥50px tall. Smaller hits
        // are typically status icons or decorative graphics.
        if (r.width >= 200 && r.height >= 50) {
            out.push(el);
        }
    });
    return out;
}

/** Find every IMG on the page whose src points at the given userId's avatar
 *  on Discord's CDN. Catches all surfaces: profile popout, full profile,
 *  member list rows, chat message authors, voice channel users, DM channel
 *  headers, etc. Discord's URL shape is stable:
 *    https://cdn.discordapp.com/avatars/<userId>/<hash>.<ext>?size=...
 *  We also accept the path-relative form Discord occasionally uses
 *  (`/assets/...`) — but those are anonymous defaults so we skip them.
 *  Returns ALL imgs by user; the caller decides whether to swap them all
 *  (self-preview) or per-roster-user (live mode). */
function findAvatarImgsForUser(userId: string): HTMLImageElement[] {
    if (!userId) return [];
    const out: HTMLImageElement[] = [];
    const needle = `/avatars/${userId}/`;
    document.querySelectorAll("img").forEach(img => {
        const el = img as HTMLImageElement;
        const src = el.currentSrc || el.src || "";
        if (src.includes(needle)) out.push(el);
    });
    return out;
}

/** Profile-view-only avatars (popout 80px, full profile 120px). Used as a
 *  fallback when we couldn't read currentUser?.id yet (very early startup). */
function findProfileViewAvatars(): HTMLImageElement[] {
    const out: HTMLImageElement[] = [];
    document.querySelectorAll('img[class*="avatar__"]').forEach(c => {
        const el = c as HTMLImageElement;
        const r = el.getBoundingClientRect();
        if (r.width >= 60 && r.height >= 60) out.push(el);
    });
    return out;
}

/** Given a banner, climb the DOM until we find a container big enough to be
 *  a profile popout / full-profile view (≥280px wide AND ≥300px tall). This
 *  is the element we paint theme colors on. */
function findProfileContainerFromBanner(banner: HTMLElement): HTMLElement | null {
    let el: HTMLElement | null = banner.parentElement;
    while (el && el !== document.body) {
        const r = el.getBoundingClientRect();
        if (r.width >= 280 && r.height >= 300) return el;
        el = el.parentElement;
    }
    return null;
}

/** Try to identify whose profile a popout/full-profile view belongs to. Modern
 *  Discord doesn't put `data-user-id` on profile containers, so we extract it
 *  from an avatar IMG inside via the CDN URL shape
 *  `cdn.discordapp.com/avatars/<userId>/<hash>.<ext>`. Returns null when the
 *  user has Discord's default avatar (no per-user CDN URL — those use
 *  `/assets/<hash>.png` instead). */
function getUserIdFromContainer(container: Element): string | null {
    const imgs = container.querySelectorAll('img[class*="avatar__"]');
    for (const img of imgs) {
        const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src || "";
        const m = src.match(/\/avatars\/(\d{17,20})\//);
        if (m) return m[1];
    }
    return null;
}

/** Single point that decides what flair (if any) to render for a given user.
 *  - Self (me.id === userId): prefer local plugin settings so saves render
 *    instantly without a worker roundtrip.
 *  - Other users on roster: read their saved flair from `getRosterProfileFlair`.
 *  - Anyone else: return null (no flair).
 *  Falls through viewer toggles, hide list, and TournamentMode gates. */
function resolveFlairForUserId(userId: string | null, kind: "banner" | "avatar" | "theme"): ProfileFlair | null {
    const s = settings.store;
    if (!s.showOthersFlair) {
        // Master viewer-toggle is off — still allow self-preview rendering on
        // your own popout, otherwise the setter UX feels broken (you set a
        // banner and don't see it).
        const me = UserStore.getCurrentUser?.();
        if (!me?.id || userId !== me.id) return null;
    }
    if (kind === "banner" && !s.showOthersBanner) {
        const me = UserStore.getCurrentUser?.();
        if (!me?.id || userId !== me.id) return null;
    }
    if (kind === "avatar" && !s.showOthersAvatar) {
        const me = UserStore.getCurrentUser?.();
        if (!me?.id || userId !== me.id) return null;
    }
    if (kind === "theme" && !s.showOthersThemeColors) {
        const me = UserStore.getCurrentUser?.();
        if (!me?.id || userId !== me.id) return null;
    }
    if (userId && isFlairHiddenForUser(userId)) return null;

    let flair: ProfileFlair | null = null;
    const me = UserStore.getCurrentUser?.();
    if (userId && me?.id === userId) {
        const local: ProfileFlair = {};
        const b = s.myBannerUrl.trim(); if (b) local.bannerUrl = b;
        const a = s.myAvatarAnimatedUrl.trim(); if (a) local.avatarAnimatedUrl = a;
        const p = s.myThemeColorPrimary.trim(); if (p) local.themeColorPrimary = p;
        const sc = s.myThemeColorSecondary.trim(); if (sc) local.themeColorSecondary = sc;
        if (Object.keys(local).length) flair = local;
    } else if (userId) {
        flair = getRosterProfileFlair(userId) ?? null;
    }
    if (!flair) return null;

    if ((kind === "banner" || kind === "avatar") && isTournamentModeActive()) return null;
    return flair;
}

function applyBanner(banner: HTMLElement, url: string) {
    if (isVideoUrl(url)) {
        // Route through dm-media:// proxy so arbitrary HTTPS MP4 URLs work
        // (Chromium ORB blocks direct cross-origin video; main-process fetch
        // bypasses ORB and serves through a same-origin custom scheme).
        const proxiedUrl = proxyVideoUrl(url);
        const existing = banner.querySelector(".dm-flair-banner-video") as HTMLVideoElement | null;
        if (existing) {
            // Already a video here — update src if URL changed, otherwise no-op.
            if (existing.src !== proxiedUrl) {
                existing.src = proxiedUrl;
                existing.load();
                existing.play().catch(() => {});
            }
        } else {
            if (!banner.style.position) banner.style.position = "relative";
            const v = document.createElement("video");
            v.className = "dm-flair-banner-video";
            v.src = proxiedUrl;
            v.autoplay = true;
            v.loop = true;
            v.muted = true;
            v.playsInline = true;
            banner.appendChild(v);
            v.play().catch(() => {});
        }
    } else {
        // Image URL — clean up any leftover <video> element from a previous
        // video URL, then the inline background-image below takes over.
        banner.querySelectorAll(".dm-flair-banner-video").forEach(v => v.remove());
        // Inline styles with `important` priority beat every stylesheet rule
        // (theme, Discord's own, anything) — no specificity war.
        banner.style.setProperty("background-image", `url("${url}")`, "important");
        banner.style.setProperty("background-size", "cover", "important");
        banner.style.setProperty("background-position", "center", "important");
        banner.style.setProperty("background-repeat", "no-repeat", "important");
        banner.setAttribute("data-dm-flair-banner-applied", "1");
    }
}

/** Accept `RRGGBB`, `#RRGGBB`, or `0xRRGGBB` and emit canonical `#RRGGBB`.
 *  Invalid input returns null so we don't pollute CSS with garbage. */
function normalizeColor(input: string | undefined): string | null {
    if (!input) return null;
    const v = input.trim().replace(/^0x/i, "").replace(/^#/, "");
    if (/^[0-9a-f]{6}$/i.test(v)) return `#${v.toLowerCase()}`;
    if (/^[0-9a-f]{3}$/i.test(v)) {
        // Expand 3-digit shorthand
        return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toLowerCase();
    }
    return null;
}

function applyTheme(container: HTMLElement, primary?: string, secondary?: string) {
    const p = normalizeColor(primary);
    const s = normalizeColor(secondary);
    if (!p && !s) return;

    // Set CSS vars too (in case any Discord child rule consumes them).
    if (p) {
        container.style.setProperty("--profile-gradient-primary-color", p, "important");
        container.style.setProperty("--profile-body-background-color", p, "important");
    }
    if (s) {
        container.style.setProperty("--profile-gradient-secondary-color", s, "important");
    }

    // Probe showed Discord's visual-refresh popout/full-profile DON'T actually
    // paint a gradient from --profile-gradient-* vars on any visible element.
    // So we paint directly: a linear gradient from primary → secondary as the
    // container's background-image. Inline `!important` beats Discord's dark
    // default backgroundColor.
    if (p && s) {
        container.style.setProperty(
            "background-image",
            `linear-gradient(180deg, ${p} 0%, ${s} 100%)`,
            "important"
        );
    } else if (p) {
        container.style.setProperty("background-color", p, "important");
        container.style.setProperty("background-image", "none", "important");
    } else if (s) {
        container.style.setProperty("background-color", s, "important");
        container.style.setProperty("background-image", "none", "important");
    }
    container.setAttribute("data-dm-flair-theme-applied", "1");
}

function applyAvatar(avatar: HTMLImageElement, url: string) {
    if (avatar.src !== url) {
        // Stash the original src so we can restore on plugin stop / setting
        // change (or if the URL fails — caller would handle that).
        if (!avatar.dataset.dmFlairOriginalSrc) {
            avatar.dataset.dmFlairOriginalSrc = avatar.src;
        }
        avatar.src = url;
        avatar.setAttribute("data-dm-flair-avatar-applied", "1");
    }
}

function scanForPopouts(_root: ParentNode = document) {
    const me = UserStore.getCurrentUser?.();
    const tmActive = isTournamentModeActive();

    // ── Banner + theme (per-popout: identify whose popout, look up their flair) ──
    const banners = findAllProfileBanners();

    for (const banner of banners) {
        const container = findProfileContainerFromBanner(banner);
        if (!container) continue;
        // Identify whose popout this is by extracting userId from an avatar
        // img inside. Falls back to self-preview when we can't (default-avatar
        // user or extremely fast popout open) so the setter UX still works.
        let userId = getUserIdFromContainer(container);
        if (!userId && me?.id) userId = me.id;

        const bannerFlair = resolveFlairForUserId(userId, "banner");
        if (bannerFlair?.bannerUrl) {
            const suppressForTM = tmActive && isAnimatedUrl(bannerFlair.bannerUrl);
            if (!suppressForTM) {
                applyBanner(banner, bannerFlair.bannerUrl);
            }
        }

        const themeFlair = resolveFlairForUserId(userId, "theme");
        if (themeFlair?.themeColorPrimary || themeFlair?.themeColorSecondary) {
            applyTheme(container, themeFlair.themeColorPrimary, themeFlair.themeColorSecondary);
        }
    }

    // ── Avatar swaps page-wide (member list, chat, voice, DM headers, popout) ──
    // For each [class*="avatar__"] img, extract its userId from the src and
    // apply that user's roster avatar flair. This naturally covers self AND
    // other users in one pass — every img tells us whose it is via its src.
    if (!tmActive) {
        document.querySelectorAll('img[class*="avatar__"]').forEach(img => {
            const el = img as HTMLImageElement;
            const src = el.currentSrc || el.src || "";
            const m = src.match(/\/avatars\/(\d{17,20})\//);
            if (!m) return;
            const userId = m[1];
            const avatarFlair = resolveFlairForUserId(userId, "avatar");
            if (avatarFlair?.avatarAnimatedUrl) {
                applyAvatar(el, avatarFlair.avatarAnimatedUrl);
            }
        });
        // Profile-view fallback: large avatars (≥60px) that don't have a CDN
        // URL we could match (default-avatar users). If we're viewing our own
        // popout in self-preview, swap those too.
        const fallback = findProfileViewAvatars();
        for (const a of fallback) {
            if (a.dataset.dmFlairAvatarApplied) continue;
            const container = findProfileContainerFromBanner(a as any) ?? a.closest('[class*="user-profile-popout"]') ?? a.parentElement;
            const userId = container ? getUserIdFromContainer(container) : null;
            const flair = resolveFlairForUserId(userId, "avatar");
            if (flair?.avatarAnimatedUrl) applyAvatar(a, flair.avatarAnimatedUrl);
        }
        // Warn once if the current user has a default avatar.
        if (me && me.avatar === null && settings.store.myAvatarAnimatedUrl.trim() && !defaultAvatarWarned) {
            defaultAvatarWarned = true;
            toast(
                "⚠ Your Discord avatar is set to the default — your animated avatar will only show on profile popouts + full profile, not member list or chat. Upload any custom Discord avatar to fix.",
                Toasts.Type.MESSAGE,
                10000
            );
        }
    }
}

function startObserver() {
    if (observer) return;
    // MutationObserver kicks off a rescan on ANY DOM mutation under body.
    // Cheap rescan because scanForPopouts queries by class — no walking.
    observer = new MutationObserver(() => scanForPopouts(document));
    observer.observe(document.body, { childList: true, subtree: true });
    scanForPopouts(document);
    rescanTimer = window.setInterval(() => scanForPopouts(document), 1000);
}

function stopObserver() {
    observer?.disconnect();
    observer = null;
    if (rescanTimer !== null) { clearInterval(rescanTimer); rescanTimer = null; }
    document.querySelectorAll("[data-dm-flair-banner-applied]").forEach(el => {
        const e = el as HTMLElement;
        e.style.removeProperty("background-image");
        e.style.removeProperty("background-size");
        e.style.removeProperty("background-position");
        e.style.removeProperty("background-repeat");
        e.removeAttribute("data-dm-flair-banner-applied");
    });
    document.querySelectorAll("[data-dm-flair-theme-applied]").forEach(el => {
        const e = el as HTMLElement;
        e.style.removeProperty("background-image");
        e.style.removeProperty("background-color");
        e.style.removeProperty("--profile-gradient-primary-color");
        e.style.removeProperty("--profile-gradient-secondary-color");
        e.style.removeProperty("--profile-body-background-color");
        e.removeAttribute("data-dm-flair-theme-applied");
    });
    // Restore original avatar srcs so toggling the plugin off + on doesn't
    // leave broken images sitting around.
    document.querySelectorAll("[data-dm-flair-avatar-applied]").forEach(el => {
        const img = el as HTMLImageElement;
        const orig = img.dataset.dmFlairOriginalSrc;
        if (orig) img.src = orig;
        delete img.dataset.dmFlairOriginalSrc;
        img.removeAttribute("data-dm-flair-avatar-applied");
    });
    document.querySelectorAll(".dm-flair-banner-video").forEach(v => v.remove());
}

export default definePlugin({
    name: "DMProfileFlair",
    description:
        "Custom profile banner / animated avatar / theme colors, visible only to other Discordmaxxer users. " +
        "Tier-gated server-side. Animated content auto-suppresses when TournamentMode is on.",
    authors: [{ name: "Diggy", id: 0n }],
    settings,

    start() {
        style = createAndAppendStyle("dm-profile-flair", managedStyleRootNode);
        style.textContent = buildCss();
        startObserver();
    },

    stop() {
        stopObserver();
        style?.remove();
        style = null;
        // Reset the warn-once latch so toggling the plugin off+on re-surfaces
        // the default-avatar warning if it still applies.
        defaultAvatarWarned = false;
    }
});
