// Check / install the udev rule that grants access to the UDCAP dongles.
// Installation elevates via pkexec (graphical polkit prompt).

use serde::Serialize;
use std::fs;
use std::process::Command;

const RULE_PATH: &str = "/etc/udev/rules.d/70-udcap.rules";
const RULE: &str = include_str!("70-udcap.rules");

#[derive(Serialize)]
pub struct UdevStatus {
    pub installed: bool,
    pub up_to_date: bool,
}

pub fn status() -> UdevStatus {
    match fs::read_to_string(RULE_PATH) {
        Ok(s) => UdevStatus {
            installed: true,
            up_to_date: s.trim() == RULE.trim(),
        },
        Err(_) => UdevStatus {
            installed: false,
            up_to_date: false,
        },
    }
}

pub fn install() -> Result<(), String> {
    // Stage the rule somewhere the elevated shell can read it.
    let tmp = std::env::temp_dir().join("70-udcap.rules");
    fs::write(&tmp, RULE).map_err(|e| format!("write temp rule: {e}"))?;

    let script = format!(
        "install -m 0644 '{}' '{}' && udevadm control --reload-rules && \
         udevadm trigger --subsystem-match=usb --subsystem-match=tty",
        tmp.display(),
        RULE_PATH
    );

    let status = Command::new("pkexec")
        .args(["sh", "-c", &script])
        .status()
        .map_err(|e| format!("could not run pkexec (is polkit installed?): {e}"))?;

    if status.success() {
        Ok(())
    } else {
        Err("Permission request was cancelled or failed.".into())
    }
}
