// Mapping of the udcap-server shared memory (see udcap_shm.h). Layout must match
// the C header exactly (#[repr(C)]).

use memmap2::MmapMut;
use serde::Serialize;
use std::fs::OpenOptions;
use std::sync::atomic::{fence, AtomicU32, Ordering};

pub const SHM_PATH: &str = "/dev/shm/udcap_hands";
pub const SHM_MAGIC: u32 = 0x5544_4331;
pub const SHM_VERSION: u32 = 12;
pub const HAND_COUNT: usize = 2;

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
    fps: f32,
    fw: [u8; 16],
    glove_serial: [u8; 24],
    haptic_seq: u32,
    haptic_index: i32,
    haptic_duration_s: f32,
    haptic_strength: i32,
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
}

#[derive(Serialize, Clone, Default)]
pub struct ShmView {
    pub server_pid: u32,
    pub calib_state: u32,
    pub cmd_ack: u32,
    pub cmd_seq: u32,
    pub curl_gain: f32,
    pub splay_gain: f32,
    pub hands: Vec<HandView>,
}

fn cstr(bytes: &[u8]) -> String {
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    String::from_utf8_lossy(&bytes[..end]).into_owned()
}

fn curl(q: Quat) -> f32 {
    let w = q.w.abs().min(1.0);
    (2.0 * w.acos() / MAX_BEND_RAD).clamp(0.0, 1.0)
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
        ShmView {
            server_pid: if pid_alive(g.server_pid) { g.server_pid } else { 0 },
            calib_state: g.calib_state,
            cmd_ack: g.cmd_ack,
            cmd_seq: g.cmd_seq,
            curl_gain: g.curl_gain,
            splay_gain: g.splay_gain,
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
    pub fn test_vibration(&self, hand: usize, strength: i32, duration_s: f32) {
        if hand >= HAND_COUNT {
            return;
        }
        let h = unsafe { &mut (*self.ptr).hands[hand] };
        h.haptic_index = -1;
        h.haptic_duration_s = duration_s;
        h.haptic_strength = strength;
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
        let g = unsafe { &mut *self.ptr };
        g.cmd_code = code;
        g.cmd_arg = arg;
        let seq_atomic = unsafe { &*(&g.cmd_seq as *const u32 as *const AtomicU32) };
        seq_atomic.fetch_add(1, Ordering::Release) + 1
    }
}
