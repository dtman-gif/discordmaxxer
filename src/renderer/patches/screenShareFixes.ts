/*
 * Vesktop, a desktop app aiming to give you a snappier Discord Experience
 * Copyright (c) 2023 Vendicated and Vencord contributors
 * Copyright (c) 2026 Discordmaxxer contributors — Windows per-window audio patch
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@vencord/types/utils";
import { currentSettings, currentSourceId } from "renderer/components/ScreenSharePicker";
import { State } from "renderer/settings";
import { isLinux } from "renderer/utils";

const logger = new Logger("VesktopStreamFixes");

const isWindows = !isLinux && navigator.platform.startsWith("Win");

if (isLinux) {
    const original = navigator.mediaDevices.getDisplayMedia;

    async function getVirtmic() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevice = devices.find(({ label }) => label === "vencord-screen-share");
            return audioDevice?.deviceId;
        } catch (error) {
            return null;
        }
    }

    navigator.mediaDevices.getDisplayMedia = async function (opts) {
        const stream = await original.call(this, opts);
        const id = await getVirtmic();

        const frameRate = Number(State.store.screenshareQuality?.frameRate ?? 30);
        const height = Number(State.store.screenshareQuality?.resolution ?? 720);
        const width = Math.round(height * (16 / 9));
        const track = stream.getVideoTracks()[0];

        track.contentHint = String(currentSettings?.contentHint);

        const constraints = {
            ...track.getConstraints(),
            frameRate: { min: frameRate, ideal: frameRate },
            width: { min: 640, ideal: width, max: width },
            height: { min: 480, ideal: height, max: height },
            advanced: [{ width: width, height: height }],
            resizeMode: "none"
        };

        track
            .applyConstraints(constraints)
            .then(() => {
                logger.info("Applied constraints successfully. New constraints: ", track.getConstraints());
            })
            .catch(e => logger.error("Failed to apply constraints.", e));

        if (id) {
            const audio = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: {
                        exact: id
                    },
                    autoGainControl: false,
                    echoCancellation: false,
                    noiseSuppression: false,
                    channelCount: 2,
                    sampleRate: 48000,
                    sampleSize: 16
                }
            });

            stream.getAudioTracks().forEach(t => stream.removeTrack(t));
            stream.addTrack(audio.getAudioTracks()[0]);
        }

        return stream;
    };
}

// Windows screenshare audio: swap Electron's system-wide "loopback" audio
// (which captures EVERY sound playing through Windows, including your friend's
// voice coming back from Discord) for a per-window audio capture pinned to the
// exact source the user picked. Mirrors stock Discord's behavior — viewers
// hear only the shared window/tab's audio, never the incoming call.
//
// Mechanism: when getDisplayMedia resolves, the returned MediaStream has a
// loopback audio track. We call getUserMedia with Chromium's legacy
// chromeMediaSource constraint pinned to the same source id, which on Win11
// gives back a per-window audio track. Swap tracks on the stream and stop the
// loopback track to release the system audio capture.
if (isWindows) {
    const original = navigator.mediaDevices.getDisplayMedia;

    navigator.mediaDevices.getDisplayMedia = async function (opts) {
        const stream = await original.call(this, opts);

        // Only intervene when the user actually asked for audio AND the picker
        // recorded a source id. If either is missing, leave the loopback in
        // place — losing audio is worse than the echo.
        if (!currentSettings?.audio || !currentSourceId) return stream;

        try {
            const audio = await navigator.mediaDevices.getUserMedia({
                audio: {
                    // Legacy Chromium desktop-capture constraint. On Win11 with
                    // a Window Graphics Capture-capable source, Chromium binds
                    // the audio capture to the same process backing the source
                    // id — i.e. per-window audio, not system loopback.
                    mandatory: {
                        chromeMediaSource: "desktop",
                        chromeMediaSourceId: currentSourceId
                    }
                } as any
            });

            const newTrack = audio.getAudioTracks()[0];
            if (!newTrack) {
                logger.warn("Per-window audio capture returned no tracks; keeping loopback.");
                return stream;
            }

            // Stop the loopback track so we release the system-audio capture
            // before swapping. Removing without stopping would leave the
            // underlying capture session open in some Chromium versions.
            stream.getAudioTracks().forEach(t => {
                stream.removeTrack(t);
                t.stop();
            });
            stream.addTrack(newTrack);

            logger.info(
                `Swapped loopback audio for per-window capture (source: ${currentSourceId}).`
            );
        } catch (e) {
            // Most likely failure: Chromium rejected chromeMediaSource because
            // the source id doesn't support per-process audio (e.g. full-screen
            // share on a build without WGC audio support). Keep the loopback
            // so the share still has SOME audio — better degraded than silent.
            logger.error("Per-window audio capture failed, keeping loopback:", e);
        }

        return stream;
    };
}
