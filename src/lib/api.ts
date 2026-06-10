import { invoke } from "@tauri-apps/api/core";

export interface HandView {
  present: boolean;
  link: number;
  calibrated: boolean;
  battery: number;
  fps: number;
  fw: string;
  glove_serial: string;
  tracker_serial: string;
  btn_a: boolean;
  btn_b: boolean;
  btn_menu: boolean;
  btn_joy: boolean;
  btn_power: boolean;
  trigger: number;
  grip: number;
  trackpad: number;
  joy_x: number;
  joy_y: number;
  curl: number[]; // [thumb, index, middle, ring, little]
  offset_pos: number[]; // [x,y,z] meters
  offset_deg: number[]; // [x,y,z] degrees
  curl_min: number[]; // per finger
  curl_max: number[]; // per finger
  grip_pos: number[]; // [x,y,z] meters — grip/menu position offset
  grip_rot: number[]; // [x,y,z] degrees — grip/menu rotation
  btn_src: number[]; // per output [A,B,System,Stick,Trigger,Grip] = source
  trigger_finger: number;
  grip_finger: number;
  trigger_min: number;
  trigger_max: number;
  grip_min: number;
  grip_max: number;
}

export interface ShmView {
  server_pid: number;
  calib_state: number;
  cmd_ack: number;
  cmd_seq: number;
  curl_gain: number;
  hands: HandView[];
}

export interface Status {
  server_running: boolean;
  shm: ShmView | null;
  shm_error: string | null;
}

export const CMD = {
  CALIB_START: 1,
  CALIB_FIST: 2,
  CALIB_TOGETHER: 3,
  CALIB_SPREAD: 4,
  CALIB_COMPLETE: 5,
  CALIB_CANCEL: 6,
  CALIB_AUTO: 7,
} as const;

export const CALIB = {
  IDLE: 0,
  STARTED: 1,
  GOT_FIST: 2,
  GOT_TOGETHER: 3,
  GOT_SPREAD: 4,
  DONE: 5,
  ERROR: 6,
} as const;

export const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"];

export const poll = () => invoke<Status>("poll");
export const serverStart = (trackerLeft: string, trackerRight: string) =>
  invoke("server_start", { trackerLeft, trackerRight });
export const serverStop = () => invoke("server_stop");
export const setServerBin = (path: string) => invoke("set_server_bin", { path });
export const setOffset = (hand: number, pos: number[], deg: number[]) =>
  invoke("set_offset", { hand, pos, deg });
export const setCurlRange = (hand: number, finger: number, min: number, max: number) =>
  invoke("set_curl_range", { hand, finger, min, max });
export const setGrip = (hand: number, pos: number[], deg: number[]) =>
  invoke("set_grip", { hand, pos, deg });
export const setCurlGain = (gain: number) => invoke("set_curl_gain", { gain });
export const setBtnMap = (hand: number, map: number[]) => invoke("set_btn_map", { hand, map });
export const setAnalog = (
  hand: number,
  triggerFinger: number,
  gripFinger: number,
  triggerMin: number,
  triggerMax: number,
  gripMin: number,
  gripMax: number,
) => invoke("set_analog", { hand, triggerFinger, gripFinger, triggerMin, triggerMax, gripMin, gripMax });

// Button remap: btn_src[output] = source.
export const BTN_OUTPUTS = ["A button", "B button", "System / Menu", "Stick click", "Trigger", "Grip"];
export const BTN_SOURCES = ["None", "A", "B", "A + B", "Stick"]; // index = udcap_btn_src
// Finger source for analog trigger/grip (index = udcap finger; 5 = grip avg).
export const FINGER_SEL = ["Thumb", "Index", "Middle", "Ring", "Pinky", "Grip (M+R+P)"];
export const testVibration = (hand: number, strength: number, duration: number) =>
  invoke("test_vibration", { hand, strength, duration });
export const getServerBin = () => invoke<string>("get_server_bin");
export const shmVersion = () => invoke<number>("shm_version");
export const sendCommand = (code: number) => invoke<number>("send_command", { code });

export interface UdevStatus {
  installed: boolean;
  up_to_date: boolean;
}
export const udevStatus = () => invoke<UdevStatus>("udev_status");
export const udevInstall = () => invoke("udev_install");
