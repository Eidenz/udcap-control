import { poll, setServerBin, setOffset, setGrip, setCurlGain, type Status } from "./api";

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

export const BUILTIN_TRACKER = {
  left: { pos: [0, 0, 0], deg: [45, 85, 0] },
  right: { pos: [0, 0, 0], deg: [45, -85, 0] },
};
export const BUILTIN_GRIP = {
  left: { pos: [0.06, -0.06, 0.01], rot: [70, -5, -55] },
  right: { pos: [-0.06, -0.06, 0.01], rot: [70, -5, 75] },
};

export const CURL_GAIN_MAX = 1.5;

export const spaceConfig = $state(
  loadJSON("udcap.space", { preset: "Vive Tracker 3.0", offsets: clone(BUILTIN_TRACKER) }),
);
export const gripConfig = $state(loadJSON("udcap.grip", { mode: "Built-in", values: clone(BUILTIN_GRIP) }));
export const curl = $state({ gain: Math.min(CURL_GAIN_MAX, Number(ls?.getItem("udcap.gain") ?? CURL_GAIN_MAX)) });

export const saveSpace = () => ls?.setItem("udcap.space", JSON.stringify(spaceConfig));
export const saveGrip = () => ls?.setItem("udcap.grip", JSON.stringify(gripConfig));
export const saveCurlGain = () => ls?.setItem("udcap.gain", String(curl.gain));

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
}

let timer: ReturnType<typeof setInterval> | undefined;
let shmWasPresent = false;

async function tick() {
  try {
    app.status = await poll();
    app.connected = true;
    const present = !!app.status?.shm && app.status.shm.server_pid !== 0;
    if (present && !shmWasPresent) applySavedToShm();
    shmWasPresent = present;
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
