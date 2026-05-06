/*
 * Discordmaxxer — sound manager
 * Copyright (c) 2026 Diggy
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Per-theme sound packs. Plays a click/toggle/error sound bound to the
 * active theme. No-ops cleanly when audio assets are missing — safe to
 * call from any plugin without checking.
 *
 * Audio source: looks up `dm-sounds.{themeId}.{name}` in localStorage
 * (set via the future asset-loader) OR falls back to a synthesized tone
 * via Web Audio API matching the theme's vibe.
 *
 * Asset path convention (for when files are wired): each theme can ship
 * its own click/toggle/error/notify sound. Asset format: data: URL or
 * vesktop://assets/themes/<id>/<name>.wav.
 */

import { THEMES, ThemeId } from "./themes";

type SoundName = "click" | "toggle" | "error" | "notify";

let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
    if (audioCtx) return audioCtx;
    try {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        return audioCtx;
    } catch {
        return null;
    }
}

/**
 * Synthesized fallback tone — used when no audio file is registered for
 * the theme/sound combo. Pitch + decay tuned per theme vibe.
 */
const SYNTH_PROFILES: Record<ThemeId, Record<SoundName, { freq: number; dur: number; type: OscillatorType; gain: number }>> = {
    maxxer: {
        click:  { freq: 880, dur: 0.06, type: "sine",     gain: 0.05 },
        toggle: { freq: 660, dur: 0.10, type: "triangle", gain: 0.06 },
        error:  { freq: 220, dur: 0.18, type: "sawtooth", gain: 0.08 },
        notify: { freq: 1320, dur: 0.20, type: "sine",     gain: 0.06 }
    },
    val: {
        // Tactical: short, sharp, mid-low
        click:  { freq: 600, dur: 0.04, type: "square",   gain: 0.05 },
        toggle: { freq: 440, dur: 0.08, type: "square",   gain: 0.06 },
        error:  { freq: 180, dur: 0.20, type: "sawtooth", gain: 0.09 },
        notify: { freq: 880, dur: 0.12, type: "triangle", gain: 0.06 }
    },
    sonic: {
        // Kinetic: bright, rising
        click:  { freq: 1320, dur: 0.05, type: "sine",     gain: 0.05 },
        toggle: { freq: 1760, dur: 0.08, type: "sine",     gain: 0.05 },
        error:  { freq: 330, dur: 0.16, type: "sawtooth", gain: 0.07 },
        notify: { freq: 2200, dur: 0.22, type: "sine",     gain: 0.05 }
    },
    dmc: {
        // Gothic: deep, sustain
        click:  { freq: 220, dur: 0.10, type: "triangle", gain: 0.06 },
        toggle: { freq: 165, dur: 0.16, type: "triangle", gain: 0.07 },
        error:  { freq: 110, dur: 0.30, type: "sawtooth", gain: 0.10 },
        notify: { freq: 440, dur: 0.20, type: "sine",     gain: 0.06 }
    },
    bo3: {
        // Military: dry, percussive
        click:  { freq: 500, dur: 0.03, type: "square",   gain: 0.06 },
        toggle: { freq: 380, dur: 0.06, type: "square",   gain: 0.06 },
        error:  { freq: 160, dur: 0.18, type: "sawtooth", gain: 0.08 },
        notify: { freq: 720, dur: 0.10, type: "triangle", gain: 0.06 }
    }
};

function synth(themeId: ThemeId, sound: SoundName) {
    const c = ctx();
    if (!c) return;
    const profile = SYNTH_PROFILES[themeId]?.[sound] ?? SYNTH_PROFILES.maxxer[sound];
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = profile.type;
    osc.frequency.value = profile.freq;
    gain.gain.setValueAtTime(profile.gain, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + profile.dur);
    osc.connect(gain).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + profile.dur);
}

/**
 * Play a sound from the active theme. Looks for a registered asset first;
 * falls back to a synthesized tone.
 */
export function playSound(sound: SoundName, themeId?: ThemeId) {
    const id = (themeId ?? (document.body.className.match(/dm-theme-(\w+)/)?.[1] as ThemeId)) ?? "maxxer";
    if (!THEMES[id]) return;

    // Future hook: registered asset URL
    const assetKey = `dm-sounds.${id}.${sound}`;
    const url = (() => {
        try { return localStorage.getItem(assetKey); } catch { return null; }
    })();

    if (url) {
        try {
            const audio = new Audio(url);
            audio.volume = 0.6;
            void audio.play();
            return;
        } catch {
            // fall through to synth
        }
    }

    synth(id, sound);
}

/**
 * Register a custom asset URL (data: or vesktop://) for a given theme/sound.
 * Persists to localStorage. Future asset-loader UI calls this.
 */
export function registerSound(themeId: ThemeId, sound: SoundName, url: string) {
    try { localStorage.setItem(`dm-sounds.${themeId}.${sound}`, url); } catch {}
}

/** Whether sounds are enabled (read by call-sites; default true). */
export function soundsEnabled(): boolean {
    try { return localStorage.getItem("dm-sounds.enabled") !== "false"; } catch { return true; }
}

export function setSoundsEnabled(on: boolean) {
    try { localStorage.setItem("dm-sounds.enabled", on ? "true" : "false"); } catch {}
}
