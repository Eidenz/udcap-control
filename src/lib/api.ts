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
  joy_x: number;
  joy_y: number;
  curl: number[]; // [thumb, index, middle, ring, little]
  offset_pos: number[]; // [x,y,z] meters
  offset_deg: number[]; // [x,y,z] degrees
}

export interface ShmView {
  server_pid: number;
  calib_state: number;
  cmd_ack: number;
  cmd_seq: number;
  hands: HandView[];
}

export interface Status {
  server_running: boolean;
  shm: ShmView | null;
}

export const CMD = {
  CALIB_START: 1,
  CALIB_FIST: 2,
  CALIB_TOGETHER: 3,
  CALIB_SPREAD: 4,
  CALIB_COMPLETE: 5,
  CALIB_CANCEL: 6,
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
export const sendCommand = (code: number) => invoke<number>("send_command", { code });

export interface UdevStatus {
  installed: boolean;
  up_to_date: boolean;
}
export const udevStatus = () => invoke<UdevStatus>("udev_status");
export const udevInstall = () => invoke("udev_install");
