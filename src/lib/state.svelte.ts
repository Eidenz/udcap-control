import { poll, setServerBin, type Status } from "./api";

const ls = typeof localStorage !== "undefined" ? localStorage : null;

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

let timer: ReturnType<typeof setInterval> | undefined;

async function tick() {
  try {
    app.status = await poll();
    app.connected = true;
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
