// Messages between the two windows. The full window ("main") runs the app:
// polling, saved settings, calibration cues. Minimalist mode's status window
// ("mini") reads the shared memory for its display and asks main to act.
import { emitTo, listen } from "@tauri-apps/api/event";
import type { AppMode, Tab } from "./state.svelte";

export type MiniAction =
  | { kind: "hello" } // the mini window loaded: send it the meta
  | { kind: "start" }
  | { kind: "stop" }
  | { kind: "calibrate" }
  | { kind: "open"; tab: Tab }
  | { kind: "sticks" }
  | { kind: "dismissSticks" };

// What the mini window can't read from the shared memory.
export type MiniMeta = {
  mode: AppMode;
  busy: boolean;
  error: string | null;
  stickNotice: boolean;
};

export const toMain = (a: MiniAction) => emitTo("main", "udcap:action", a).catch(() => {});
export const onAction = (fn: (a: MiniAction) => void) => listen<MiniAction>("udcap:action", (e) => fn(e.payload));
export const toMini = (m: MiniMeta) => emitTo("mini", "udcap:meta", m).catch(() => {});
export const onMeta = (fn: (m: MiniMeta) => void) => listen<MiniMeta>("udcap:meta", (e) => fn(e.payload));
