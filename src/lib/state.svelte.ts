import {
  poll,
  setServerBin,
  setOffset,
  setGrip,
  setCurlGain,
  setSplayGain,
  setCurlRange,
  setBtnMap,
  setAnalog,
  type Status,
} from "./api";

const ls = typeof localStorage !== "undefined" ? localStorage : null;
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const s = ls?.getItem(key);
    return s ? { ...fallback, ...JSON.parse(s) } : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

// Shared reactive app state (Svelte 5 universal runes).
export const app = $state<{ status: Status | null; connected: boolean }>({
  status: null,
  connected: false,
});

// Persisted user config.
export const config = $state({
  trackerLeft: ls?.getItem("udcap.tl") ?? "",
  trackerRight: ls?.getItem("udcap.tr") ?? "",
  serverBin: ls?.getItem("udcap.bin") ?? "",
});

export function saveConfig() {
  ls?.setItem("udcap.tl", config.trackerLeft);
  ls?.setItem("udcap.tr", config.trackerRight);
  ls?.setItem("udcap.bin", config.serverBin);
  if (config.serverBin) setServerBin(config.serverBin).catch(() => {});
}

// --- Space / grip alignment (built-in presets must mirror the server defaults) ---

type Offset = { pos: number[]; deg: number[] };
// Runtime mode — Monado and SteamVR tune their alignment offsets separately
// (their pose conventions differ), so the Space offsets are stored per-mode.
export type AppMode = "monado" | "steamvr";

// Built-in hand-alignment profiles, per runtime. Monado puts the grip at the
// tracker (position ~0, rotation only); SteamVR needs a tracker→grip offset.
export const TRACKER_PRESETS: Record<string, Record<AppMode, { left: Offset; right: Offset }>> = {
  "Vive Tracker 3.0": {
    monado: {
      left: { pos: [0, 0, 0], deg: [45, 85, 0] },
      right: { pos: [0, 0, 0], deg: [45, -85, 0] },
    },
    steamvr: {
      left: { pos: [0.1, 0.02, -0.12], deg: [60, -60, 70] },
      right: { pos: [-0.1, 0.02, -0.12], deg: [60, 60, -70] },
    },
  },
};
export const presetOffsets = (name: string, mode: AppMode) =>
  TRACKER_PRESETS[name]?.[mode] ?? TRACKER_PRESETS["Vive Tracker 3.0"][mode];

export const BUILTIN_GRIP = {
  left: { pos: [0.06, -0.06, 0.01], rot: [70, -5, -55] },
  right: { pos: [-0.06, -0.06, 0.01], rot: [70, -5, 75] },
};

export const CURL_GAIN_MAX = 1.5;
export const SPLAY_GAIN_MAX = 0.5;

export const appMode = $state<{ mode: AppMode }>({
  mode: (ls?.getItem("udcap.mode") as AppMode) === "steamvr" ? "steamvr" : "monado",
});
function loadSpaceFor(mode: AppMode) {
  const fresh = loadJSON(`udcap.space.${mode}`, null);
  if (fresh) return fresh;
  if (mode === "monado") {
    const legacy = loadJSON("udcap.space", null); // migrate pre-toggle config
    if (legacy) return legacy;
  }
  return { preset: "Vive Tracker 3.0", offsets: clone(presetOffsets("Vive Tracker 3.0", mode)) };
}

export const spaceConfig = $state(loadSpaceFor(appMode.mode));
export const gripConfig = $state(loadJSON("udcap.grip", { mode: "Built-in", values: clone(BUILTIN_GRIP) }));
export const curl = $state({
  gain: Math.min(CURL_GAIN_MAX, Number(ls?.getItem("udcap.gain") ?? CURL_GAIN_MAX)),
});
// Global finger-splay strength (1 = measured); scales the abduction the core
// now decodes from the raw sensors. Persisted, re-applied on connect.
export const splay = $state({
  gain: Math.min(SPLAY_GAIN_MAX, Number(ls?.getItem("udcap.splay") ?? 1)),
});
export const saveSplayGain = () => ls?.setItem("udcap.splay", String(splay.gain));

// Per-hand, per-finger curl remap [hand][finger] = [min, max]. Persisted and
// re-applied on connect (the server resets to identity each start).
const identityRanges = (): number[][][] => [
  [
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ],
  [
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
    [0, 1],
  ],
];
function loadCurlRanges(): number[][][] {
  try {
    const o = JSON.parse(ls?.getItem("udcap.curlranges") ?? "null");
    if (Array.isArray(o) && o.length === 2 && o.every((h) => Array.isArray(h) && h.length === 5)) return o;
  } catch {
    /* fall through */
  }
  return identityRanges();
}
export const curlRanges = $state<number[][][]>(loadCurlRanges());
export const saveCurlRanges = () => ls?.setItem("udcap.curlranges", JSON.stringify(curlRanges));
export function applyCurlRange(hand: number, finger: number) {
  const [mn, mx] = curlRanges[hand][finger];
  setCurlRange(hand, finger, mn, mx).catch(() => {});
}

// Per-hand input mapping (button map + analog trigger/grip config).
export type HandIO = {
  btn: number[]; // [A,B,System,Stick,Trigger,Grip] = source
  tFinger: number;
  gFinger: number;
  tMin: number;
  tMax: number;
  gMin: number;
  gMax: number;
  deadzone: number; // thumbstick radial deadzone 0..1
  trackpad: number; // trackpad touch threshold 0..1
};
export const defaultHandIo = (): HandIO => ({
  btn: [1, 2, 3, 4, 0, 0],
  tFinger: 1,
  gFinger: 5,
  tMin: 0.15,
  tMax: 0.85,
  gMin: 0.6,
  gMax: 0.85,
  deadzone: 0,
  trackpad: 0.1,
});
function loadIo() {
  try {
    const o = JSON.parse(ls?.getItem("udcap.io") ?? "null");
    if (o && Array.isArray(o.hands) && o.hands.length === 2) {
      // Fill in fields added by later versions.
      o.hands = o.hands.map((h: Partial<HandIO>) => ({ ...defaultHandIo(), ...h }));
      return o;
    }
  } catch {
    /* fall through */
  }
  return { linked: true, hands: [defaultHandIo(), defaultHandIo()] };
}
export const io = $state<{ linked: boolean; hands: HandIO[] }>(loadIo());
export const saveIo = () => ls?.setItem("udcap.io", JSON.stringify(io));
export function applyHandIo(h: number) {
  const x = io.hands[h];
  setBtnMap(h, x.btn).catch(() => {});
  setAnalog(h, x.tFinger, x.gFinger, x.tMin, x.tMax, x.gMin, x.gMax, x.deadzone, x.trackpad).catch(() => {});
}

export const saveSpace = () => ls?.setItem(`udcap.space.${appMode.mode}`, JSON.stringify(spaceConfig));
export const saveGrip = () => ls?.setItem("udcap.grip", JSON.stringify(gripConfig));
export const saveCurlGain = () => ls?.setItem("udcap.gain", String(curl.gain));

// Write the active mode's offsets to the shm (both hands).
export function applyOffsetNow() {
  setOffset(0, spaceConfig.offsets.left.pos, spaceConfig.offsets.left.deg).catch(() => {});
  setOffset(1, spaceConfig.offsets.right.pos, spaceConfig.offsets.right.deg).catch(() => {});
}
// Switch runtime mode: persist the mode we leave, load + apply the new mode's offsets.
export function setMode(m: AppMode) {
  if (m === appMode.mode) return;
  saveSpace();
  appMode.mode = m;
  ls?.setItem("udcap.mode", m);
  const next = loadSpaceFor(m);
  spaceConfig.preset = next.preset;
  spaceConfig.offsets = next.offsets;
  applyOffsetNow();
}

// Calibration audio cues. Driven globally off calib_state so they play whoever
// triggered calibration (GUI button *or* the glove menu button), on any tab.
export const calibSound = $state({ on: ls?.getItem("udcap.calibSound") !== "0" });
export const toggleCalibSound = () => {
  calibSound.on = !calibSound.on;
  ls?.setItem("udcap.calibSound", calibSound.on ? "1" : "0");
};
const CALIB_SOUNDS: Record<number, string> = {
  7: "start", // get ready
  1: "fist",
  2: "together",
  3: "spread",
  4: "captured",
  5: "done",
};

// Use the Web Audio API rather than <audio>: cues fire from a timer (not a click),
// and the packaged webview blocks timer-triggered <audio>. An AudioContext, once
// resumed by any user gesture (unlockAudio), plays buffers programmatically.
let actx: AudioContext | null = null;
const audioBuffers = new Map<string, AudioBuffer | null>();
function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!actx) {
    try {
      actx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      actx = null;
    }
  }
  return actx;
}
async function loadSound(name: string): Promise<AudioBuffer | null> {
  if (audioBuffers.has(name)) return audioBuffers.get(name) ?? null;
  audioBuffers.set(name, null);
  const c = audioCtx();
  if (!c) return null;
  try {
    const res = await fetch(`/sounds/${name}.mp3`);
    if (!res.ok) return null;
    const buf = await c.decodeAudioData(await res.arrayBuffer());
    audioBuffers.set(name, buf);
    return buf;
  } catch {
    return null;
  }
}
export function unlockAudio() {
  const c = audioCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  Object.values(CALIB_SOUNDS).forEach((n) => loadSound(n)); // preload
}
function playCalib(name: string) {
  if (!calibSound.on) return;
  const c = audioCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  loadSound(name).then((buf) => {
    if (!buf || !actx) return;
    const src = actx.createBufferSource();
    src.buffer = buf;
    src.connect(actx.destination);
    src.start();
  });
}

// Push the active mode's saved alignment to the shm on connect.
export function applySavedToShm() {
  applyOffsetNow();
  if (gripConfig.mode === "Custom") {
    setGrip(0, gripConfig.values.left.pos, gripConfig.values.left.rot).catch(() => {});
    setGrip(1, gripConfig.values.right.pos, gripConfig.values.right.rot).catch(() => {});
  }
  setCurlGain(curl.gain).catch(() => {});
  setSplayGain(splay.gain).catch(() => {});
  for (let h = 0; h < 2; h++) for (let f = 0; f < 5; f++) applyCurlRange(h, f);
  applyHandIo(0);
  applyHandIo(1);
}

let timer: ReturnType<typeof setInterval> | undefined;
let shmWasPresent = false;
let prevCalibState = 0;

async function tick() {
  try {
    app.status = await poll();
    app.connected = true;
    const present = !!app.status?.shm && app.status.shm.server_pid !== 0;
    if (present && !shmWasPresent) applySavedToShm();
    shmWasPresent = present;

    // Only sound calibration cues while the server is live. A stale shm (crashed
    // server) shouldn't replay "done" on launch; track silently while offline.
    const cs = app.status?.shm?.calib_state ?? 0;
    if (!present) {
      prevCalibState = cs;
    } else if (cs !== prevCalibState) {
      const snd = CALIB_SOUNDS[cs];
      if (snd) playCalib(snd);
      prevCalibState = cs;
    }
  } catch {
    app.connected = false;
  }
}

export function startPolling() {
  stopPolling();
  tick();
  timer = setInterval(tick, 100);
}

export function stopPolling() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
