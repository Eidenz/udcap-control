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
  setCloseToTray,
  serverStart,
  serverStop,
  type Status,
} from "./api";

const ls = typeof localStorage !== "undefined" ? localStorage : null;
// Anything saved by an earlier version means this isn't a first launch. Read
// before this module writes anything.
const hadSettings = (() => {
  for (let i = 0; i < (ls?.length ?? 0); i++) if (ls?.key(i)?.startsWith("udcap.")) return true;
  return false;
})();
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const s = ls?.getItem(key);
    return s ? { ...fallback, ...JSON.parse(s) } : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

// Screens reachable from the sidebar ("debug" is opened from Settings).
export type Tab = "home" | "hands" | "controls" | "alignment" | "devices" | "settings" | "debug";

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

// First-launch checklist on Home. It goes away for good once the server has
// been started or the user skips it; upgrades from an earlier version never see it.
export const setup = $state({ done: hadSettings || ls?.getItem("udcap.setupDone") === "1" });
export function finishSetup() {
  if (setup.done) return;
  setup.done = true;
  ls?.setItem("udcap.setupDone", "1");
}

// Server start/stop, shared by the sidebar and the setup checklist.
export const server = $state({ busy: false, error: null as string | null });
export async function startServer() {
  server.busy = true;
  server.error = null;
  try {
    await serverStart(config.trackerLeft, config.trackerRight);
    finishSetup();
  } catch (e) {
    server.error = String(e);
  } finally {
    server.busy = false;
  }
}
export async function stopServer() {
  server.busy = true;
  try {
    await serverStop();
  } finally {
    server.busy = false;
  }
}

// Control module version last seen on each hand (1 = original, 2 = Control
// Module 2.0), so Controls shows the right drawing while the gloves are off.
function loadModules(): number[] {
  try {
    const o = JSON.parse(ls?.getItem("udcap.modules") ?? "null");
    if (Array.isArray(o) && o.length === 2) return o.map((v) => (v === 1 || v === 2 ? v : 0));
  } catch {
    /* fall through */
  }
  return [0, 0];
}
export const moduleSeen = $state<number[]>(loadModules());

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
// --- Alignment profiles (one per game) --------------------------------------
// Games disagree about where the hands and the grip/menu anchor should sit, so
// everything on the Space screen lives in named profiles. A profile keeps the
// hand alignment for BOTH runtimes (Monado and SteamVR offsets differ) plus the
// grip/menu anchor. `spaceConfig` / `gripConfig` remain the live working copies
// the Space screen edits; saveSpace / saveGrip write them back into the active
// profile. Switching profiles swaps the live copies and pushes them to the shm,
// so it takes effect in-game immediately.
export type SpaceSet = { preset: string; offsets: { left: Offset; right: Offset } };
type GripOffset = { pos: number[]; rot: number[] };
export type GripSet = { mode: string; values: { left: GripOffset; right: GripOffset } };
export type AlignmentProfile = { id: string; name: string; space: Record<AppMode, SpaceSet>; grip: GripSet };

const defaultSpace = (mode: AppMode): SpaceSet => ({
  preset: "Vive Tracker 3.0",
  offsets: clone(presetOffsets("Vive Tracker 3.0", mode)),
});
const defaultGrip = (): GripSet => ({ mode: "Built-in", values: clone(BUILTIN_GRIP) });
const newId = () => Math.random().toString(36).slice(2, 10);

// Pre-profile storage: one space set per runtime (+ the pre-toggle single key)
// and one grip set. Read once, to seed the first profile.
function loadLegacySpace(mode: AppMode): SpaceSet {
  const fresh = loadJSON<SpaceSet | null>(`udcap.space.${mode}`, null);
  if (fresh) return fresh;
  if (mode === "monado") {
    const legacy = loadJSON<SpaceSet | null>("udcap.space", null);
    if (legacy) return legacy;
  }
  return defaultSpace(mode);
}
function loadProfiles(): { active: string; list: AlignmentProfile[] } {
  try {
    const o = JSON.parse(ls?.getItem("udcap.profiles") ?? "null");
    if (o && Array.isArray(o.list) && o.list.length > 0) {
      const list: AlignmentProfile[] = o.list.map((p: Partial<AlignmentProfile>) => ({
        id: p.id ?? newId(),
        name: p.name ?? "Profile",
        space: {
          monado: p.space?.monado ?? defaultSpace("monado"),
          steamvr: p.space?.steamvr ?? defaultSpace("steamvr"),
        },
        grip: p.grip ?? defaultGrip(),
      }));
      const active = list.some((p) => p.id === o.active) ? o.active : list[0].id;
      return { active, list };
    }
  } catch {
    /* fall through */
  }
  // First run with profiles: wrap whatever was tuned before into "Default".
  const first: AlignmentProfile = {
    id: newId(),
    name: "Default",
    space: { monado: loadLegacySpace("monado"), steamvr: loadLegacySpace("steamvr") },
    grip: loadJSON<GripSet>("udcap.grip", defaultGrip()),
  };
  return { active: first.id, list: [first] };
}
export const profiles = $state(loadProfiles());
export const saveProfiles = () => ls?.setItem("udcap.profiles", JSON.stringify(profiles));
export const activeProfile = (): AlignmentProfile =>
  profiles.list.find((p) => p.id === profiles.active) ?? profiles.list[0];

export const spaceConfig = $state<SpaceSet>(clone(activeProfile().space[appMode.mode]));
export const gripConfig = $state<GripSet>(clone(activeProfile().grip));

// Replace the live copies with a profile's values (for the current runtime).
function loadLive(p: AlignmentProfile) {
  const s = p.space[appMode.mode];
  spaceConfig.preset = s.preset;
  spaceConfig.offsets = clone(s.offsets);
  gripConfig.mode = p.grip.mode;
  gripConfig.values = clone(p.grip.values);
}
function uniqueName(name: string, selfId?: string) {
  const taken = new Set(profiles.list.filter((p) => p.id !== selfId).map((p) => p.name));
  const base = name.trim() || "Profile";
  let n = base;
  for (let k = 2; taken.has(n); k++) n = `${base} (${k})`;
  return n;
}
export function selectProfile(id: string) {
  if (id === profiles.active || !profiles.list.some((p) => p.id === id)) return;
  saveSpace();
  saveGrip();
  profiles.active = id;
  loadLive(activeProfile());
  applyOffsetNow();
  applyGripNow();
  saveProfiles();
}
// A new profile starts as a copy of the current tuning, so a new game begins
// from what already works rather than from the factory preset.
export function createProfile(name: string) {
  const src = activeProfile();
  const p: AlignmentProfile = { id: newId(), name: uniqueName(name), space: clone(src.space), grip: clone(src.grip) };
  p.space[appMode.mode] = clone(spaceConfig);
  p.grip = clone(gripConfig);
  profiles.list.push(p);
  profiles.active = p.id; // live copies already match; nothing to re-apply
  saveProfiles();
}
export function renameProfile(id: string, name: string) {
  const p = profiles.list.find((x) => x.id === id);
  const n = name.trim();
  if (!p || !n || n === p.name) return;
  p.name = uniqueName(n, id);
  saveProfiles();
}
export function deleteProfile(id: string) {
  if (profiles.list.length <= 1) return;
  const i = profiles.list.findIndex((p) => p.id === id);
  if (i < 0) return;
  profiles.list.splice(i, 1);
  if (profiles.active === id) {
    profiles.active = profiles.list[Math.max(0, i - 1)].id;
    loadLive(activeProfile());
    applyOffsetNow();
    applyGripNow();
  }
  saveProfiles();
}
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

// Persist the live copies into the active profile.
export function saveSpace() {
  activeProfile().space[appMode.mode] = clone(spaceConfig);
  saveProfiles();
}
export function saveGrip() {
  activeProfile().grip = clone(gripConfig);
  saveProfiles();
}
export const saveCurlGain = () => ls?.setItem("udcap.gain", String(curl.gain));

// Write the active mode's offsets to the shm (both hands).
export function applyOffsetNow() {
  setOffset(0, spaceConfig.offsets.left.pos, spaceConfig.offsets.left.deg).catch(() => {});
  setOffset(1, spaceConfig.offsets.right.pos, spaceConfig.offsets.right.deg).catch(() => {});
}
// Write the grip/menu anchor to the shm (both hands). Always, not only for
// "Custom": switching from a custom profile back to a built-in one must reset it.
export function applyGripNow() {
  setGrip(0, gripConfig.values.left.pos, gripConfig.values.left.rot).catch(() => {});
  setGrip(1, gripConfig.values.right.pos, gripConfig.values.right.rot).catch(() => {});
}
// Switch runtime mode: stash the leaving runtime's set into the profile, then
// load + apply the profile's set for the new runtime.
export function setMode(m: AppMode) {
  if (m === appMode.mode) return;
  saveSpace();
  appMode.mode = m;
  ls?.setItem("udcap.mode", m);
  loadLive(activeProfile());
  applyOffsetNow();
}

// The Monado fork guide: one modal mounted at the page root, opened from Home
// and Devices.
export const monadoNotice = $state({ guideOpen: false });
export const openMonadoGuide = () => (monadoNotice.guideOpen = true);
export const closeMonadoGuide = () => (monadoNotice.guideOpen = false);

// One-time thumbstick nudge for the Control Module 2.0: shown the first time a 2.0
// module is seen, until acted on -- dismissed, followed to the calibration card, or a
// stick calibration completes (tick() watches joy_calib_state). `scrollTo` asks the
// Controls screen to bring its calibration card into view once it is mounted.
export const stickNotice = $state({
  done: ls?.getItem("udcap.stickNoticeDone") === "1",
  scrollTo: false,
});
export function finishStickNotice() {
  stickNotice.done = true;
  ls?.setItem("udcap.stickNoticeDone", "1");
}
export const requestStickCalibScroll = () => (stickNotice.scrollTo = true);
const JOY_CALIB_DONE = 3;

// Closing the window hides the app to the tray, keeping the server (and the
// gloves) running; off = closing quits. The backend starts out on and gets the
// saved choice at startup.
export const closeToTray = $state({ on: ls?.getItem("udcap.closeToTray") !== "0" });
export const syncCloseToTray = () => setCloseToTray(closeToTray.on).catch(() => {});
export function toggleCloseToTray() {
  closeToTray.on = !closeToTray.on;
  ls?.setItem("udcap.closeToTray", closeToTray.on ? "1" : "0");
  syncCloseToTray();
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
  applyGripNow();
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
    if (present) {
      app.status!.shm!.hands.forEach((h, i) => {
        const v = h.present ? h.controller_version : 0;
        if ((v === 1 || v === 2) && v !== moduleSeen[i]) {
          moduleSeen[i] = v;
          ls?.setItem("udcap.modules", JSON.stringify(moduleSeen));
        }
      });
    }

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
    // A completed stick calibration settles the one-time nudge.
    if (present && !stickNotice.done && app.status?.shm?.joy_calib_state === JOY_CALIB_DONE) {
      finishStickNotice();
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
