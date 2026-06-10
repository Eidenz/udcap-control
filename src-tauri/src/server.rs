// Launch and supervise the udcap-server child process.

use std::process::{Child, Command, Stdio};

#[derive(Default)]
pub struct ServerProc {
    child: Option<Child>,
    pub bin: String,
}

impl ServerProc {
    pub fn new() -> Self {
        ServerProc {
            child: None,
            // Default dev location; overridable from the UI.
            bin: "/home/eidenz/PROJECTS/UdCap-Community-HandDriver-Core/build/udcap-server".into(),
        }
    }

    pub fn start(&mut self, tracker_left: &str, tracker_right: &str) -> Result<(), String> {
        if self.running() {
            return Ok(());
        }
        let mut cmd = Command::new(&self.bin);
        // The GUI drives calibration via the command channel, so disable the
        // server's own startup calibration.
        cmd.arg("--no-cal");
        if !tracker_left.is_empty() {
            cmd.args(["--tracker-left", tracker_left]);
        }
        if !tracker_right.is_empty() {
            cmd.args(["--tracker-right", tracker_right]);
        }
        cmd.stdin(Stdio::null());
        let child = cmd
            .spawn()
            .map_err(|e| format!("failed to launch {}: {e}", self.bin))?;
        self.child = Some(child);
        Ok(())
    }

    /// Returns true if we actually had a child to kill.
    pub fn stop(&mut self) -> bool {
        if let Some(mut c) = self.child.take() {
            let _ = c.kill();
            let _ = c.wait();
            true
        } else {
            false
        }
    }

    pub fn running(&mut self) -> bool {
        match &mut self.child {
            Some(c) => matches!(c.try_wait(), Ok(None)),
            None => false,
        }
    }
}

impl Drop for ServerProc {
    fn drop(&mut self) {
        self.stop();
    }
}
