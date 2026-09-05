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
  controller_version: number; // 1 = original module, 2 = Control Module 2.0, 0 = unknown
  joystick_fw: string; // Control Module 2.0 firmware ("" on a 1.0 module)
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
  stick_deadzone: number;
  trackpad_threshold: number;
  // Diagnostics: raw calibration references for the 12 finger sensor channels
  // (f4..f15). span = fist - open. Channels 4/7/10 are splay; the rest flexion.
  cali_open: number[];
  cali_fist: number[];
  cali_live: number[];
  cali_valid: boolean;
}

export interface ReceiverView {
  present: boolean;
  linked: boolean;
  hand: number; // 0 left, 1 right, -1 unbound
  pair_state: number; // PAIR.* (0 idle, 1 searching, 2 success)
  channel: number; // -1 if unknown
  serial: string;
}

export interface ShmView {
  server_pid: number;
  calib_state: number;
  cmd_ack: number;
  cmd_seq: number;
  curl_gain: number;
  splay_gain: number;
  joy_calib_state: number; // JOY_CALIB.*
  receivers: ReceiverView[];
  hands: HandView[];
}

export const PAIR = { IDLE: 0, SEARCHING: 1, SUCCESS: 2 } as const;

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
  // Thumbstick calibration; sent with sendCommandArg(code, hand) (-1 = both).
  JOY_CALIB_CENTER: 11,
  JOY_CALIB_RANGE_START: 12,
  JOY_CALIB_RANGE_STOP: 13,
} as const;

export const JOY_CALIB = { IDLE: 0, CENTERED: 1, RANGING: 2, DONE: 3 } as const;

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
export const setSplayGain = (gain: number) => invoke("set_splay_gain", { gain });
export const setBtnMap = (hand: number, map: number[]) => invoke("set_btn_map", { hand, map });
export const setAnalog = (
  hand: number,
  triggerFinger: number,
  gripFinger: number,
  triggerMin: number,
  triggerMax: number,
  gripMin: number,
  gripMax: number,
  stickDeadzone: number,
  trackpadThreshold: number,
) =>
  invoke("set_analog", {
    hand,
    triggerFinger,
    gripFinger,
    triggerMin,
    triggerMax,
    gripMin,
    gripMax,
    stickDeadzone,
    trackpadThreshold,
  });

// Button remap: btn_src[output] = source.
export const BTN_OUTPUTS = ["A button", "B button", "System / Menu", "Stick click", "Trigger", "Grip"];
// index = udcap_btn_src. Source 3 is A + B together on the original module and
// the dedicated system button on a Control Module 2.0.
export const BTN_SOURCES = ["None", "A", "B", "System / A+B", "Stick"];
// Finger source for analog trigger/grip (index = udcap finger; 5 = grip avg).
export const FINGER_SEL = ["Thumb", "Index", "Middle", "Ring", "Pinky", "Grip (M+R+P)"];
export const testVibration = (hand: number, amplitude: number, duration: number) =>
  invoke("test_vibration", { hand, amplitude, duration });
export const getServerBin = () => invoke<string>("get_server_bin");
export const shmVersion = () => invoke<number>("shm_version");
export const appVersion = () => invoke<string>("app_version");
export const sendCommand = (code: number) => invoke<number>("send_command", { code });
export const sendCommandArg = (code: number, arg: number) => invoke<number>("send_command_arg", { code, arg });
export const pairStart = (receiver: number) => invoke<number>("pair_start", { receiver });
export const pairStop = (receiver: number) => invoke<number>("pair_stop", { receiver });
export const setChannel = (receiver: number, channel: number) =>
  invoke<number>("set_channel", { receiver, channel });

export interface UdevStatus {
  installed: boolean;
  up_to_date: boolean;
}
export const udevStatus = () => invoke<UdevStatus>("udev_status");
export const udevInstall = () => invoke("udev_install");

export interface SteamvrStatus {
  registered: boolean;
  paths_file_found: boolean;
  install_path: string;
}
export const steamvrStatus = () => invoke<SteamvrStatus>("steamvr_status");
export const steamvrInstall = () => invoke("steamvr_install");
export const steamvrRemove = () => invoke("steamvr_remove");
export const saveEnvisionProfile = () => invoke<string>("save_envision_profile");
export const saveDebugReport = (filename: string, contents: string) =>
  invoke<string>("save_debug_report", { filename, contents });
