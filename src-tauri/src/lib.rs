mod server;
mod shm;
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
}

fn ensure_shm(state: &AppState) {
    let mut guard = state.shm.lock().unwrap();
    if guard.is_none() {
        if let Ok(m) = ShmMap::open() {
            *guard = Some(m);
        }
    }
}

#[tauri::command]
fn poll(state: State<AppState>) -> Status {
    let server_running = state.server.lock().unwrap().running();
    ensure_shm(&state);
    let shm = state.shm.lock().unwrap().as_ref().map(|m| m.view());
    Status { server_running, shm }
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
fn send_command(state: State<AppState>, code: u32) -> u32 {
    match state.shm.lock().unwrap().as_ref() {
        Some(m) => m.send_command(code, 0),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            server: Mutex::new(ServerProc::new()),
            shm: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            poll,
            server_start,
            server_stop,
            set_server_bin,
            set_offset,
            send_command,
            udev_status,
            udev_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
