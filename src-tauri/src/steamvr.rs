// One-click install / remove of the bundled UDCAP SteamVR driver. The driver
// (udcap/ with driver_udcap.so) ships inside the app; installing copies it to a
// stable user dir and registers that path in SteamVR's openvrpaths.vrpath.
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize)]
pub struct SteamvrStatus {
    pub registered: bool,       // our driver is listed in openvrpaths.vrpath
    pub paths_file_found: bool, // SteamVR has run at least once
    pub install_path: String,
}

fn home() -> PathBuf {
    std::env::var("HOME").map(PathBuf::from).unwrap_or_default()
}

// Stable location the driver is copied to (independent of the app bundle).
fn install_dir() -> PathBuf {
    home().join(".local/share/udcap-steamvr/udcap")
}

fn vrpaths_file() -> Option<PathBuf> {
    [
        home().join(".config/openvr/openvrpaths.vrpath"),
        home().join(".local/share/openvr/openvrpaths.vrpath"),
    ]
    .into_iter()
    .find(|p| p.exists())
}

fn read_paths() -> Option<(PathBuf, serde_json::Value)> {
    let f = vrpaths_file()?;
    let txt = std::fs::read_to_string(&f).ok()?;
    let v = serde_json::from_str(&txt).ok()?;
    Some((f, v))
}

pub fn status() -> SteamvrStatus {
    let install_str = install_dir().to_string_lossy().to_string();
    let mut registered = false;
    let mut found = false;
    if let Some((_, v)) = read_paths() {
        found = true;
        if let Some(arr) = v.get("external_drivers").and_then(|d| d.as_array()) {
            registered = arr.iter().any(|p| p.as_str() == Some(install_str.as_str()));
        }
    }
    SteamvrStatus { registered, paths_file_found: found, install_path: install_str }
}

fn copy_driver(src_udcap: &Path) -> Result<(), String> {
    let dst = install_dir();
    std::fs::create_dir_all(dst.join("bin/linux64")).map_err(|e| e.to_string())?;
    std::fs::copy(src_udcap.join("driver.vrdrivermanifest"), dst.join("driver.vrdrivermanifest"))
        .map_err(|e| format!("copy manifest: {e}"))?;
    std::fs::copy(
        src_udcap.join("bin/linux64/driver_udcap.so"),
        dst.join("bin/linux64/driver_udcap.so"),
    )
    .map_err(|e| format!("copy driver: {e}"))?;
    Ok(())
}

// Drop any external driver whose folder is named "udcap" (old or new install).
fn strip_udcap(arr: &mut Vec<serde_json::Value>) {
    arr.retain(|p| {
        p.as_str()
            .map(|s| Path::new(s).file_name().map_or(true, |n| n != "udcap"))
            .unwrap_or(true)
    });
}

fn rewrite<F: FnOnce(&mut Vec<serde_json::Value>)>(edit: F) -> Result<(), String> {
    let (file, mut v) = read_paths().ok_or("SteamVR settings not found — launch SteamVR once first.")?;
    let arr = v
        .get_mut("external_drivers")
        .and_then(|d| d.as_array_mut())
        .ok_or("openvrpaths.vrpath has no external_drivers list")?;
    edit(arr);
    let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
    std::fs::write(&file, out).map_err(|e| e.to_string())
}

pub fn install(src_udcap: &Path) -> Result<(), String> {
    copy_driver(src_udcap)?;
    let install_str = install_dir().to_string_lossy().to_string();
    rewrite(move |arr| {
        strip_udcap(arr);
        arr.push(serde_json::Value::String(install_str));
    })
}

pub fn remove() -> Result<(), String> {
    rewrite(strip_udcap)?;
    let _ = std::fs::remove_dir_all(install_dir());
    Ok(())
}

// If the driver is already registered, refresh the installed copy from the app
// bundle. Called on startup so an app update auto-updates the driver without the
// user needing to hit Reinstall.
pub fn sync_if_registered(src_udcap: &Path) {
    if status().registered {
        let _ = copy_driver(src_udcap);
    }
}
