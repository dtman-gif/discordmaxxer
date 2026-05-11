/*
 * Discordmaxxer — dm-media:// protocol proxy
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Proxies arbitrary HTTPS media URLs through a same-origin `dm-media://`
 * scheme so they bypass Chromium's Opaque Response Blocking (ORB).
 *
 * ORB blocks no-CORS cross-origin media requests in <video>/<audio> when
 * Chromium's content-type sniffer can't confidently confirm the response
 * is a media format. It runs at the network-service layer, BEFORE the
 * renderer sees the response — so neither CSP overrides nor injected
 * Cross-Origin-Resource-Policy response headers (via webRequest) help.
 *
 * The escape hatch: fetch the URL from MAIN process (Node-side, no ORB),
 * and serve the bytes through a privileged scheme registered as same-
 * origin. The renderer sees `dm-media://...` as a local resource, no
 * cross-origin check applies.
 *
 * Plugin-side usage (DMProfileFlair):
 *     const proxied = `dm-media:///${encodeURIComponent(realUrl)}`;
 *     videoEl.src = proxied;
 *
 * Security:
 *   - Only allows https:// targets (prevents file://, http://, intranet).
 *   - Caller is the plugin renderer — Discord's own JS can't construct
 *     these URLs anyway because Discord doesn't know the scheme exists.
 *   - No auth headers / cookies are forwarded — pure public-resource
 *     fetch.
 */

import { app, net, protocol } from "electron";

// MUST be called BEFORE app.whenReady() — that's why this file is
// imported at the top of main/index.ts, where its module-level side
// effects run during the initial require pass.
protocol.registerSchemesAsPrivileged([
    {
        scheme: "dm-media",
        privileges: {
            stream: true,           // enables seekable media playback (range requests)
            supportFetchAPI: true,
            corsEnabled: true,
            bypassCSP: true,        // renderer's CSP doesn't apply to same-origin custom scheme
            standard: true,         // required for `stream: true` to take effect
            secure: true            // ALSO required for <video> URL safety check — without
                                    //   this Chromium rejects with "Media load rejected by
                                    //   URL safety check" before even fetching.
        }
    }
]);

app.whenReady().then(() => {
    protocol.handle("dm-media", async (request) => {
        // URL shape: dm-media://proxy/<url-encoded https URL>
        // Example: dm-media://proxy/https%3A%2F%2Fi.imgur.com%2Fabc.mp4
        // The `proxy` hostname is required — Chromium's <video> URL safety
        // check rejects custom-scheme URLs that lack a host component.
        const u = new URL(request.url);
        const encoded = u.pathname.replace(/^\//, "") + u.search + u.hash;
        let target: string;
        try {
            target = decodeURIComponent(encoded);
        } catch {
            return new Response("malformed target URL", { status: 400 });
        }
        if (!/^https:\/\//i.test(target)) {
            return new Response("only https:// targets allowed", { status: 400 });
        }
        try {
            // net.fetch goes through Chromium's network stack at the MAIN
            // process level — ORB doesn't apply here. We pass through the
            // Range header so video seekability works.
            const upstream = await net.fetch(target, {
                method: "GET",
                headers: {
                    // Forward Range so <video> seeking works on big files.
                    ...(request.headers.get("range") ? { range: request.headers.get("range")! } : {})
                },
                // Don't follow auth: cookies and credentials stay out of the proxy.
                credentials: "omit"
            });
            // Pass through the upstream response largely intact. We strip
            // some response headers that would confuse the renderer.
            const respHeaders = new Headers(upstream.headers);
            respHeaders.delete("content-security-policy");
            respHeaders.delete("content-security-policy-report-only");
            // Allow ranged playback.
            respHeaders.set("accept-ranges", "bytes");
            // Mark as cross-origin OK in case any downstream check runs.
            respHeaders.set("cross-origin-resource-policy", "cross-origin");
            return new Response(upstream.body, {
                status: upstream.status,
                statusText: upstream.statusText,
                headers: respHeaders
            });
        } catch (e: any) {
            console.warn("[dm-media] proxy failed:", target.slice(0, 100), e?.message ?? e);
            return new Response(`upstream error: ${e?.message ?? "unknown"}`, { status: 502 });
        }
    });
});
