import {
  poll,
  setServerBin,
  setOffset,
  setGrip,
  setCurlGain,
  setSplayGain,
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
// Built-in hand-alignment profiles. Position stays 0 (our pose chain puts the
// grip at the tracker — verified on hardware); rotation matches UDCAP's values.
export const TRACKER_PRESETS: Record<string, { left: Offset; right: Offset }> = {
  "Vive Tracker 3.0": {
    left: { pos: [0, 0, 0], deg: [45, 85, 0] },
    right: { pos: [0, 0, 0], deg: [45, -85, 0] },
  },
  Quest: {
    left: { pos: [0, 0, 0], deg: [-35, 20, 0] },
    right: { pos: [0, 0, 0], deg: [-35, -20, 0] },
  },
};
export const BUILTIN_TRACKER = TRACKER_PRESETS["Vive Tracker 3.0"];
export const BUILTIN_GRIP = {
  left: { pos: [0.06, -0.06, 0.01], rot: [70, -5, -55] },
  right: { pos: [-0.06, -0.06, 0.01], rot: [70, -5, 75] },
};

export const CURL_GAIN_MAX = 1.5;

export const spaceConfig = $state(
  loadJSON("udcap.space", { preset: "Vive Tracker 3.0", offsets: clone(BUILTIN_TRACKER) }),
);
export const gripConfig = $state(loadJSON("udcap.grip", { mode: "Built-in", values: clone(BUILTIN_GRIP) }));
export const curl = $state({
  gain: Math.min(CURL_GAIN_MAX, Number(ls?.getItem("udcap.gain") ?? CURL_GAIN_MAX)),
  splay: Number(ls?.getItem("udcap.splay") ?? 1),
});
export const saveSplay = () => ls?.setItem("udcap.splay", String(curl.splay));

// Per-hand input mapping (button map + analog trigger/grip config).
export type HandIO = {
  btn: number[]; // [A,B,System,Stick,Trigger,Grip] = source
  tFinger: number;
  gFinger: number;
  tMin: number;
  tMax: number;
  gMin: number;
  gMax: number;
};
export const defaultHandIo = (): HandIO => ({
  btn: [1, 2, 3, 4, 0, 0],
  tFinger: 1,
  gFinger: 5,
  tMin: 0.15,
  tMax: 0.85,
  gMin: 0.15,
  gMax: 0.85,
});
function loadIo() {
  try {
    const o = JSON.parse(ls?.getItem("udcap.io") ?? "null");
    if (o && Array.isArray(o.hands) && o.hands.length === 2) return o;
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
  setAnalog(h, x.tFinger, x.gFinger, x.tMin, x.tMax, x.gMin, x.gMax).catch(() => {});
}

export const saveSpace = () => ls?.setItem("udcap.space", JSON.stringify(spaceConfig));
export const saveGrip = () => ls?.setItem("udcap.grip", JSON.stringify(gripConfig));
export const saveCurlGain = () => ls?.setItem("udcap.gain", String(curl.gain));

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

// Push any *custom* saved alignment to the shm. Built-in modes are left alone:
// the server already wrote those defaults at startup.
export function applySavedToShm() {
  if (spaceConfig.preset === "Custom") {
    setOffset(0, spaceConfig.offsets.left.pos, spaceConfig.offsets.left.deg).catch(() => {});
    setOffset(1, spaceConfig.offsets.right.pos, spaceConfig.offsets.right.deg).catch(() => {});
  }
  if (gripConfig.mode === "Custom") {
    setGrip(0, gripConfig.values.left.pos, gripConfig.values.left.rot).catch(() => {});
    setGrip(1, gripConfig.values.right.pos, gripConfig.values.right.rot).catch(() => {});
  }
  setCurlGain(curl.gain).catch(() => {});
  setSplayGain(curl.splay).catch(() => {});
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

    const cs = app.status?.shm?.calib_state ?? 0;
    if (cs !== prevCalibState) {
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
