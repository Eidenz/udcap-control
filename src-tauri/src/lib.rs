mod server;
mod shm;

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

#[tauri::command]
fn server_start(
    state: State<AppState>,
    tracker_left: String,
    tracker_right: String,
) -> Result<(), String> {
    state
        .server
        .lock()
        .unwrap()
        .start(&tracker_left, &tracker_right)?;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
