// Mapping of the udcap-server shared memory (see udcap_shm.h). Layout must match
// the C header exactly (#[repr(C)]).

use memmap2::MmapMut;
use serde::Serialize;
use std::fs::OpenOptions;
use std::sync::atomic::{fence, AtomicU32, Ordering};

pub const SHM_PATH: &str = "/dev/shm/udcap_hands";
pub const SHM_MAGIC: u32 = 0x5544_4331;
pub const SHM_VERSION: u32 = 14;
pub const HAND_COUNT: usize = 2;
pub const RECEIVER_MAX: usize = 4;

// Receiver-targeted command codes (see enum udcap_cmd in udcap_shm.h).
pub const CMD_PAIR_START: u32 = 8;
pub const CMD_PAIR_STOP: u32 = 9;
pub const CMD_SET_CHANNEL: u32 = 10;
// Thumbstick calibration (cmd_arg = hand, -1 = every hand).
pub const CMD_JOY_CALIB_CENTER: u32 = 11;
pub const CMD_JOY_CALIB_RANGE_START: u32 = 12;
pub const CMD_JOY_CALIB_RANGE_STOP: u32 = 13;

const MAX_BEND_RAD: f32 = 1.35;

#[repr(C)]
#[derive(Clone, Copy)]
struct Quat {
    x: f32,
    y: f32,
    z: f32,
    w: f32,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct Finger {
    proximal: Quat,
    intermediate: Quat,
    distal: Quat,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct Skeleton {
    thumb: Finger,
    index: Finger,
    middle: Finger,
    ring: Finger,
    little: Finger,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct Hand {
    seq: u32,
    present: u32,
    link: u32,
    calibrated: u32,
    battery: u32,
    _pad0: u32,
    timestamp_ns: u64,
    skel: Skeleton,
    joy_x: f32,
    joy_y: f32,
    trigger: f32,
    grip: f32,
    trackpad: f32,
    btn_a: u32,
    btn_b: u32,
    btn_menu: u32,
    btn_joy: u32,
    btn_power: u32,
    controller_version: u32, // 1 = original module, 2 = Control Module 2.0, 0 = unknown
    fps: f32,
    fw: [u8; 16],
    glove_serial: [u8; 24],
    joystick_fw: [u8; 16], // Control Module 2.0 firmware ("" on a 1.0 module)
    haptic_seq: u32,
    haptic_index: i32,
    haptic_duration_s: f32,
    haptic_strength: i32,
    haptic_amplitude: f32, // 0..1; 0 = server falls back to haptic_strength
    haptic_freq_hz: f32,   // 0 = module default
    tracker_serial: [u8; 32],
    offset_pos: [f32; 3],
    offset_rot_deg: [f32; 3],
    curl_min: [f32; 5],
    curl_max: [f32; 5],
    grip_pos: [f32; 3],
    grip_rot_deg: [f32; 3],
    btn_src: [u8; 6],
    trigger_finger: u8,
    grip_finger: u8,
    trigger_min: f32,
    trigger_max: f32,
    grip_min: f32,
    grip_max: f32,
    stick_deadzone: f32,
    trackpad_threshold: f32,
    // Diagnostics (v13): raw calibration internals for the 12 finger sensor
    // channels (f4..f15). See udcap_shm.h. Written by the server outside the
    // seqlock; used only by the control-app debug page.
    cali_open: [f32; 12],
    cali_fist: [f32; 12],
    cali_live: [f32; 12],
    cali_valid: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct Receiver {
    present: u32,
    linked: u32,
    hand: u32,
    pair_state: u32,
    channel: u32,
    serial: [u8; 24],
}

#[repr(C)]
struct Shm {
    magic: u32,
    version: u32,
    server_pid: u32,
    _pad: u32,
    hands: [Hand; HAND_COUNT],
    cmd_seq: u32,
    cmd_code: u32,
    cmd_arg: i32,
    cmd_ack: u32,
    calib_state: u32,
    curl_gain: f32,
    splay_gain: f32,
    cmd_arg2: i32,
    receiver_count: u32,
    receivers: [Receiver; RECEIVER_MAX],
    joy_calib_state: u32, // enum udcap_joy_calib_state
}

/* ---- Serializable views sent to the frontend ---- */

#[derive(Serialize, Clone, Default)]
pub struct HandView {
    pub present: bool,
    pub link: u32,
    pub calibrated: bool,
    pub battery: u32,
    pub fps: f32,
    pub fw: String,
    pub glove_serial: String,
    pub tracker_serial: String,
    pub btn_a: bool,
    pub btn_b: bool,
    pub btn_menu: bool,
    pub btn_joy: bool,
    pub btn_power: bool,
    pub controller_version: u32,
    pub joystick_fw: String,
    pub trigger: f32,
    pub grip: f32,
    pub trackpad: f32,
    pub joy_x: f32,
    pub joy_y: f32,
    pub curl: [f32; 5], // thumb, index, middle, ring, little
    pub offset_pos: [f32; 3],
    pub offset_deg: [f32; 3],
    pub curl_min: [f32; 5],
    pub curl_max: [f32; 5],
    pub grip_pos: [f32; 3],
    pub grip_rot: [f32; 3],
    pub btn_src: [u8; 6],
    pub trigger_finger: u8,
    pub grip_finger: u8,
    pub trigger_min: f32,
    pub trigger_max: f32,
    pub grip_min: f32,
    pub grip_max: f32,
    pub stick_deadzone: f32,
    pub trackpad_threshold: f32,
    // Diagnostics: per raw-sensor-channel calibration references (12 channels,
    // f4..f15). span = fist - open reveals joints that barely move. Channels
    // 4/7/10 are splay (index/ring/little); the rest are flexion.
    pub cali_open: [f32; 12],
    pub cali_fist: [f32; 12],
    pub cali_live: [f32; 12],
    pub cali_valid: bool,
}

#[derive(Serialize, Clone, Default)]
pub struct ReceiverView {
    pub present: bool,
    pub linked: bool,
    pub hand: i32,       // 0/1 once bound, -1 while unbound
    pub pair_state: u32, // enum udcap_pair_state (0 idle, 1 searching, 2 success)
    pub channel: i32,    // -1 if unknown
    pub serial: String,
}

#[derive(Serialize, Clone, Default)]
pub struct ShmView {
    pub server_pid: u32,
    pub calib_state: u32,
    pub cmd_ack: u32,
    pub cmd_seq: u32,
    pub curl_gain: f32,
    pub splay_gain: f32,
    pub joy_calib_state: u32,
    pub receivers: Vec<ReceiverView>,
    pub hands: Vec<HandView>,
}

fn cstr(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..end]).into_owned()
}

fn curl(q: Quat) -> f32 {
    // Continuous rotation angle (2*atan2(|vec|, w)) so a hard curl can't fold
    // back toward 0 the way 2*acos(|w|) does once rotation passes 180°.
    let v = (q.x * q.x + q.y * q.y + q.z * q.z).sqrt();
    (2.0 * v.atan2(q.w) / MAX_BEND_RAD).clamp(0.0, 1.0)
}


pub struct ShmMap {
    _mmap: MmapMut,
    ptr: *mut Shm,
}

// Safety: the pointer aliases the mmap which lives in the struct; access is
// guarded behind &mut self in the Tauri managed state mutex.
unsafe impl Send for ShmMap {}

impl ShmMap {
    pub fn open() -> Result<ShmMap, String> {
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(SHM_PATH)
            .map_err(|e| format!("open {SHM_PATH}: {e} (is udcap-server running?)"))?;
        let len = std::mem::size_of::<Shm>();
        let meta = file.metadata().map_err(|e| e.to_string())?;
        if (meta.len() as usize) < len {
            return Err(format!("shm too small ({} < {len})", meta.len()));
        }
        let mmap = unsafe { MmapMut::map_mut(&file).map_err(|e| e.to_string())? };
        let ptr = mmap.as_ptr() as *mut Shm;
        let shm = unsafe { &*ptr };
        if shm.magic != SHM_MAGIC || shm.version != SHM_VERSION {
            return Err(format!(
                "shm magic/version mismatch (got {:08x}/{}, want {:08x}/{})",
                shm.magic, shm.version, SHM_MAGIC, SHM_VERSION
            ));
        }
        Ok(ShmMap { _mmap: mmap, ptr })
    }

    fn seq_atomic(h: &Hand) -> &AtomicU32 {
        unsafe { &*(&h.seq as *const u32 as *const AtomicU32) }
    }

    fn read_hand(&self, i: usize) -> HandView {
        let base = unsafe { &(*self.ptr).hands[i] };
        // seqlock read
        let h = loop {
            let s = Self::seq_atomic(base).load(Ordering::Acquire);
            if s & 1 != 0 {
                continue;
            }
            let snap = unsafe { std::ptr::read_volatile(base as *const Hand) };
            fence(Ordering::Acquire);
            if Self::seq_atomic(base).load(Ordering::Relaxed) == s {
                break snap;
            }
        };
        HandView {
            present: h.present != 0,
            link: h.link,
            calibrated: h.calibrated != 0,
            battery: h.battery,
            fps: h.fps,
            fw: cstr(&h.fw),
            glove_serial: cstr(&h.glove_serial),
            tracker_serial: cstr(&h.tracker_serial),
            btn_a: h.btn_a != 0,
            btn_b: h.btn_b != 0,
            btn_menu: h.btn_menu != 0,
            btn_joy: h.btn_joy != 0,
            btn_power: h.btn_power != 0,
            controller_version: h.controller_version,
            joystick_fw: cstr(&h.joystick_fw),
            trigger: h.trigger,
            grip: h.grip,
            trackpad: h.trackpad,
            joy_x: h.joy_x,
            joy_y: h.joy_y,
            curl: [
                curl(h.skel.thumb.proximal),
                curl(h.skel.index.proximal),
                curl(h.skel.middle.proximal),
                curl(h.skel.ring.proximal),
                curl(h.skel.little.proximal),
            ],
            offset_pos: h.offset_pos,
            offset_deg: h.offset_rot_deg,
            curl_min: h.curl_min,
            curl_max: h.curl_max,
            grip_pos: h.grip_pos,
            grip_rot: h.grip_rot_deg,
            btn_src: h.btn_src,
            trigger_finger: h.trigger_finger,
            grip_finger: h.grip_finger,
            trigger_min: h.trigger_min,
            trigger_max: h.trigger_max,
            grip_min: h.grip_min,
            grip_max: h.grip_max,
            stick_deadzone: h.stick_deadzone,
            trackpad_threshold: h.trackpad_threshold,
            cali_open: h.cali_open,
            cali_fist: h.cali_fist,
            cali_live: h.cali_live,
            cali_valid: h.cali_valid != 0,
        }
    }

    pub fn view(&self) -> ShmView {
        // A server that crashed without resetting server_pid leaves a stale
        // (live-looking) shm. Report the pid only if that process is actually our
        // running server, so the UI treats a stale shm as "offline".
        fn pid_alive(pid: u32) -> bool {
            pid != 0
                && std::fs::read_to_string(format!("/proc/{pid}/comm"))
                    .map(|c| c.trim() == "udcap-server")
                    .unwrap_or(false)
        }
        let g = unsafe { &*self.ptr };
        let nrecv = (g.receiver_count as usize).min(RECEIVER_MAX);
        let receivers = (0..nrecv)
            .map(|i| {
                let r = &g.receivers[i];
                ReceiverView {
                    present: r.present != 0,
                    linked: r.linked != 0,
                    hand: if r.hand == 0 || r.hand == 1 { r.hand as i32 } else { -1 },
                    pair_state: r.pair_state,
                    channel: if r.channel == 0xFFFF_FFFF { -1 } else { r.channel as i32 },
                    serial: cstr(&r.serial),
                }
            })
            .collect();
        ShmView {
            server_pid: if pid_alive(g.server_pid) { g.server_pid } else { 0 },
            calib_state: g.calib_state,
            cmd_ack: g.cmd_ack,
            cmd_seq: g.cmd_seq,
            curl_gain: g.curl_gain,
            splay_gain: g.splay_gain,
            joy_calib_state: g.joy_calib_state,
            receivers,
            hands: (0..HAND_COUNT).map(|i| self.read_hand(i)).collect(),
        }
    }

    pub fn set_offset(&self, hand: usize, pos: [f32; 3], deg: [f32; 3]) {
        if hand >= HAND_COUNT {
            return;
        }
        let h = unsafe { &mut (*self.ptr).hands[hand] };
        h.offset_pos = pos;
        h.offset_rot_deg = deg;
    }

    /// Fire a one-off haptic pulse on a hand (same channel the driver uses).
    /// `amplitude` is 0..1; the legacy 4..10 strength is derived for old servers.
    pub fn test_vibration(&self, hand: usize, amplitude: f32, duration_s: f32) {
        if hand >= HAND_COUNT {
            return;
        }
        let amp = amplitude.clamp(0.0, 1.0);
        let h = unsafe { &mut (*self.ptr).hands[hand] };
        h.haptic_index = -1;
        h.haptic_duration_s = duration_s;
        h.haptic_strength = 4 + (amp * 6.0).round() as i32;
        h.haptic_amplitude = amp;
        h.haptic_freq_hz = 0.0;
        let seq = unsafe { &*(&h.haptic_seq as *const u32 as *const AtomicU32) };
        seq.fetch_add(1, Ordering::Release);
    }

    pub fn set_curl_range(&self, hand: usize, finger: usize, min: f32, max: f32) {
        if hand >= HAND_COUNT || finger >= 5 {
            return;
        }
        let h = unsafe { &mut (*self.ptr).hands[hand] };
        h.curl_min[finger] = min;
        h.curl_max[finger] = max;
    }

    pub fn set_curl_gain(&self, gain: f32) {
        unsafe {
            (*self.ptr).curl_gain = gain;
        }
    }

    pub fn set_splay_gain(&self, gain: f32) {
        unsafe {
            (*self.ptr).splay_gain = gain;
        }
    }

    pub fn set_btn_map(&self, hand: usize, map: [u8; 6]) {
        if hand >= HAND_COUNT {
            return;
        }
        unsafe {
            (*self.ptr).hands[hand].btn_src = map;
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_analog(
        &self,
        hand: usize,
        tf: u8,
        gf: u8,
        tmin: f32,
        tmax: f32,
        gmin: f32,
        gmax: f32,
        deadzone: f32,
        trackpad: f32,
    ) {
        if hand >= HAND_COUNT {
            return;
        }
        let h = unsafe { &mut (*self.ptr).hands[hand] };
        h.trigger_finger = tf;
        h.grip_finger = gf;
        h.trigger_min = tmin;
        h.trigger_max = tmax;
        h.grip_min = gmin;
        h.grip_max = gmax;
        h.stick_deadzone = deadzone;
        h.trackpad_threshold = trackpad;
    }

    pub fn set_grip(&self, hand: usize, pos: [f32; 3], deg: [f32; 3]) {
        if hand >= HAND_COUNT {
            return;
        }
        let h = unsafe { &mut (*self.ptr).hands[hand] };
        h.grip_pos = pos;
        h.grip_rot_deg = deg;
    }

    /// Mark the segment as having no live server (used after we kill our child,
    /// since SIGKILL prevents the server's own cleanup from running).
    pub fn mark_offline(&self) {
        unsafe {
            (*self.ptr).server_pid = 0;
        }
    }

    /// Issue a command to the server (bumps cmd_seq). Returns the new seq.
    pub fn send_command(&self, code: u32, arg: i32) -> u32 {
        self.send_command2(code, arg, 0)
    }

    /// Issue a command with a secondary argument (e.g. channel value).
    pub fn send_command2(&self, code: u32, arg: i32, arg2: i32) -> u32 {
        let g = unsafe { &mut *self.ptr };
        g.cmd_code = code;
        g.cmd_arg = arg;
        g.cmd_arg2 = arg2;
        let seq_atomic = unsafe { &*(&g.cmd_seq as *const u32 as *const AtomicU32) };
        seq_atomic.fetch_add(1, Ordering::Release) + 1
    }
}

#[cfg(test)]
mod layout {
    use super::*;

    // Byte-for-byte parity with the C header (udcap_shm.h, v14). The C numbers
    // come from `sizeof`/`offsetof` on the same header; a mismatch here means a
    // field was added on one side only.
    #[test]
    fn matches_c_layout() {
        use std::mem::{offset_of, size_of};
        assert_eq!(size_of::<Hand>(), 704);
        assert_eq!(size_of::<Receiver>(), 44);
        assert_eq!(size_of::<Shm>(), 1640);
        assert_eq!(offset_of!(Hand, controller_version), 312);
        assert_eq!(offset_of!(Hand, joystick_fw), 360);
        assert_eq!(offset_of!(Hand, haptic_seq), 376);
        assert_eq!(offset_of!(Hand, haptic_amplitude), 392);
        assert_eq!(offset_of!(Hand, tracker_serial), 400);
        assert_eq!(offset_of!(Hand, cali_valid), 696);
        assert_eq!(offset_of!(Shm, receivers), 1460);
        assert_eq!(offset_of!(Shm, joy_calib_state), 1636);
    }
}
