mod server;
mod shm;
mod steamvr;
mod udev;

use server::ServerProc;
use shm::{ShmMap, ShmView};
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    server: Mutex<ServerProc>,
    shm: Mutex<Option<ShmMap>>,
}

#[derive(Serialize)]
struct Status {
    /// Did this app spawn a server that is still alive?
    server_running: bool,
    /// Live shared-memory view (None if no server/shm is available).
    shm: Option<ShmView>,
    /// Why the shm couldn't be opened (e.g. version mismatch), if applicable.
    shm_error: Option<String>,
}

fn ensure_shm(state: &AppState) -> Option<String> {
    let mut guard = state.shm.lock().unwrap();
    if guard.is_none() {
        return match ShmMap::open() {
            Ok(m) => {
                *guard = Some(m);
                None
            }
            Err(e) => Some(e),
        };
    }
    None
}

#[tauri::command]
fn poll(state: State<AppState>) -> Status {
    let server_running = state.server.lock().unwrap().running();
    let shm_error = ensure_shm(&state);
    let shm = state.shm.lock().unwrap().as_ref().map(|m| m.view());
    Status {
        server_running,
        shm,
        shm_error,
    }
}

// Find the udcap-server binary without any hard-coded paths: user override ->
// bundled resource (packaged app) -> next to the executable -> dev binaries dir
// -> PATH.
fn resolve_server_bin(app: &tauri::AppHandle, override_path: &str) -> String {
    use tauri::Manager;
    if !override_path.is_empty() && std::path::Path::new(override_path).exists() {
        return override_path.to_string();
    }
    if let Ok(p) = app.path().resolve("udcap-server", tauri::path::BaseDirectory::Resource) {
        if p.exists() {
            return p.to_string_lossy().into_owned();
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in ["udcap-server", "binaries/udcap-server"] {
                let p = dir.join(name);
                if p.exists() {
                    return p.to_string_lossy().into_owned();
                }
            }
        }
    }
    let dev = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/udcap-server");
    if dev.exists() {
        return dev.to_string_lossy().into_owned();
    }
    "udcap-server".to_string()
}

#[tauri::command]
fn server_start(
    app: tauri::AppHandle,
    state: State<AppState>,
    tracker_left: String,
    tracker_right: String,
) -> Result<(), String> {
    // On a fresh start, clear any stale segment (e.g. from an older server
    // version) so the new server creates a clean one, and drop our old mapping
    // so we re-open the fresh inode.
    if !state.server.lock().unwrap().running() {
        let _ = std::fs::remove_file(shm::SHM_PATH);
        *state.shm.lock().unwrap() = None;
    }

    let bin = {
        let s = state.server.lock().unwrap();
        resolve_server_bin(&app, &s.bin)
    };
    state
        .server
        .lock()
        .unwrap()
        .start(&bin, &tracker_left, &tracker_right)?;
    // Give the server a moment to create the shm, then map it.
    std::thread::sleep(std::time::Duration::from_millis(700));
    *state.shm.lock().unwrap() = ShmMap::open().ok();
    Ok(())
}

#[tauri::command]
fn server_stop(state: State<AppState>) {
    let killed = state.server.lock().unwrap().stop();
    let mut g = state.shm.lock().unwrap();
    if killed {
        if let Some(m) = g.as_ref() {
            m.mark_offline();
        }
    }
    *g = None;
}

#[tauri::command]
fn set_server_bin(state: State<AppState>, path: String) {
    state.server.lock().unwrap().bin = path;
}

#[tauri::command]
fn set_offset(state: State<AppState>, hand: usize, pos: [f32; 3], deg: [f32; 3]) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.set_offset(hand, pos, deg);
    }
}

#[tauri::command]
fn set_curl_range(state: State<AppState>, hand: usize, finger: usize, min: f32, max: f32) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.set_curl_range(hand, finger, min, max);
    }
}

#[tauri::command]
fn set_grip(state: State<AppState>, hand: usize, pos: [f32; 3], deg: [f32; 3]) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.set_grip(hand, pos, deg);
    }
}

#[tauri::command]
fn set_curl_gain(state: State<AppState>, gain: f32) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.set_curl_gain(gain);
    }
}

#[tauri::command]
fn set_splay_gain(state: State<AppState>, gain: f32) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.set_splay_gain(gain);
    }
}

#[tauri::command]
fn set_btn_map(state: State<AppState>, hand: usize, map: [u8; 6]) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.set_btn_map(hand, map);
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn set_analog(
    state: State<AppState>,
    hand: usize,
    trigger_finger: u8,
    grip_finger: u8,
    trigger_min: f32,
    trigger_max: f32,
    grip_min: f32,
    grip_max: f32,
    stick_deadzone: f32,
    trackpad_threshold: f32,
) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.set_analog(
            hand,
            trigger_finger,
            grip_finger,
            trigger_min,
            trigger_max,
            grip_min,
            grip_max,
            stick_deadzone,
            trackpad_threshold,
        );
    }
}

#[tauri::command]
fn test_vibration(state: State<AppState>, hand: usize, strength: i32, duration: f32) {
    if let Some(m) = state.shm.lock().unwrap().as_ref() {
        m.test_vibration(hand, strength, duration);
    }
}

#[tauri::command]
fn get_server_bin(state: State<AppState>) -> String {
    state.server.lock().unwrap().bin.clone()
}

#[tauri::command]
fn shm_version() -> u32 {
    shm::SHM_VERSION
}

#[tauri::command]
fn app_version(app: tauri::AppHandle) -> String {
    use tauri::Manager;
    app.package_info().version.to_string()
}

#[tauri::command]
fn send_command(state: State<AppState>, code: u32) -> u32 {
    match state.shm.lock().unwrap().as_ref() {
        Some(m) => m.send_command(code, 0),
        None => 0,
    }
}

#[tauri::command]
fn pair_start(state: State<AppState>, receiver: i32) -> u32 {
    match state.shm.lock().unwrap().as_ref() {
        Some(m) => m.send_command(shm::CMD_PAIR_START, receiver),
        None => 0,
    }
}

#[tauri::command]
fn pair_stop(state: State<AppState>, receiver: i32) -> u32 {
    match state.shm.lock().unwrap().as_ref() {
        Some(m) => m.send_command(shm::CMD_PAIR_STOP, receiver),
        None => 0,
    }
}

#[tauri::command]
fn set_channel(state: State<AppState>, receiver: i32, channel: i32) -> u32 {
    match state.shm.lock().unwrap().as_ref() {
        Some(m) => m.send_command2(shm::CMD_SET_CHANNEL, receiver, channel),
        None => 0,
    }
}

#[tauri::command]
fn udev_status() -> udev::UdevStatus {
    udev::status()
}

#[tauri::command]
fn udev_install() -> Result<(), String> {
    udev::install()
}

#[tauri::command]
fn steamvr_status() -> steamvr::SteamvrStatus {
    steamvr::status()
}

#[tauri::command]
fn steamvr_install(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    let src = app
        .path()
        .resolve("steamvr-driver/udcap", tauri::path::BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    steamvr::install(&src)
}

#[tauri::command]
fn steamvr_remove() -> Result<(), String> {
    steamvr::remove()
}

/// Write the bundled Envision profile (the single source of truth in
/// extras/envision/) to the user's Downloads folder. Returns the full path so the
/// UI can show it / reveal it.
#[tauri::command]
fn save_envision_profile(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    const PROFILE: &str = include_str!("../../extras/envision/udcap-monado.json");
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    let path = dir.join("udcap-monado.json");
    std::fs::write(&path, PROFILE).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Write a debug/diagnostics report (JSON produced by the frontend) to the
/// user's Downloads folder. Returns the full path so the UI can reveal it.
#[tauri::command]
fn save_debug_report(app: tauri::AppHandle, filename: String, contents: String) -> Result<String, String> {
    use tauri::Manager;
    // Guard against path traversal: keep only the file name component.
    let name = std::path::Path::new(&filename)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "udcap-debug.json".to_string());
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    let path = dir.join(name);
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            server: Mutex::new(ServerProc::new()),
            shm: Mutex::new(None),
        })
        .setup(|app| {
            use tauri::Manager;
            // If the SteamVR driver is registered, refresh the installed copy from
            // the bundle so an app update auto-updates the driver.
            if let Ok(src) = app
                .path()
                .resolve("steamvr-driver/udcap", tauri::path::BaseDirectory::Resource)
            {
                steamvr::sync_if_registered(&src);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            poll,
            server_start,
            server_stop,
            set_server_bin,
            set_offset,
            set_curl_range,
            set_grip,
            set_curl_gain,
            set_splay_gain,
            set_btn_map,
            set_analog,
            test_vibration,
            get_server_bin,
            shm_version,
            app_version,
            send_command,
            pair_start,
            pair_stop,
            set_channel,
            udev_status,
            udev_install,
            steamvr_status,
            steamvr_install,
            steamvr_remove,
            save_envision_profile,
            save_debug_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
