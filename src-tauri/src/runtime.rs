//! Is a VR runtime attached to the gloves? Both runtime drivers map the server's
//! shared memory and keep it mapped while they run, so a runtime process with
//! the current segment in its memory map is connected. One still holding an
//! older segment (the server was restarted under it) isn't.

use crate::shm::SHM_PATH;
use serde::Serialize;
use std::os::unix::fs::MetadataExt;

const STEAMVR: &[&str] = &["vrserver"];
// WiVRn builds Monado in, so it can host the same driver.
const MONADO: &[&str] = &["monado-service", "wivrn-server"];

#[derive(Serialize, Clone, Copy, Default)]
pub struct RuntimeLinks {
    pub steamvr: bool,
    pub monado: bool,
}

pub fn scan() -> RuntimeLinks {
    let mut out = RuntimeLinks::default();
    let Ok(ino) = std::fs::metadata(SHM_PATH).map(|m| m.ino()) else {
        return out;
    };
    let Ok(dir) = std::fs::read_dir("/proc") else {
        return out;
    };
    for entry in dir.flatten() {
        let name = entry.file_name();
        let Some(pid) = name.to_str().filter(|s| s.bytes().all(|b| b.is_ascii_digit())) else {
            continue;
        };
        let Ok(comm) = std::fs::read_to_string(format!("/proc/{pid}/comm")) else {
            continue;
        };
        let comm = comm.trim_end();
        let slot = if STEAMVR.contains(&comm) {
            &mut out.steamvr
        } else if MONADO.contains(&comm) {
            &mut out.monado
        } else {
            continue;
        };
        if !*slot && maps_segment(pid, ino) {
            *slot = true;
        }
    }
    out
}

// A maps line is "addr perms offset dev inode path"; a segment unlinked since
// it was mapped ends in " (deleted)" instead of the path.
fn maps_segment(pid: &str, ino: u64) -> bool {
    let Ok(maps) = std::fs::read_to_string(format!("/proc/{pid}/maps")) else {
        return false;
    };
    maps.lines().any(|l| {
        l.ends_with(SHM_PATH) && l.split_whitespace().nth(4).and_then(|s| s.parse::<u64>().ok()) == Some(ino)
    })
}

