//! Keep the display awake while the timer is Running.
//!
//! On Windows, `SetThreadExecutionState` is called from a dedicated long-lived
//! thread so `ES_CONTINUOUS` remains associated with a living thread. Other
//! platforms are no-ops.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[derive(Debug)]
pub struct WakeGuard {
    running: Arc<AtomicBool>,
}

impl WakeGuard {
    pub fn start() -> Self {
        let running = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&running);
        thread::Builder::new()
            .name("flip-cube-wake".into())
            .spawn(move || wake_thread(flag))
            .ok();
        Self { running }
    }

    pub fn set_running(&self, on: bool) {
        self.running.store(on, Ordering::SeqCst);
    }

    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

fn wake_thread(flag: Arc<AtomicBool>) {
    let mut last = false;
    loop {
        let on = flag.load(Ordering::SeqCst);
        if on != last {
            apply_wake(on);
            last = on;
        }
        thread::sleep(Duration::from_millis(500));
    }
}

#[cfg(windows)]
fn apply_wake(on: bool) {
    // EXECUTION_STATE values from winbase.h
    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn SetThreadExecutionState(es_flags: u32) -> u32;
    }
    unsafe {
        if on {
            let _ = SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED);
        } else {
            let _ = SetThreadExecutionState(ES_CONTINUOUS);
        }
    }
}

#[cfg(not(windows))]
fn apply_wake(_on: bool) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toggle_flag() {
        let g = WakeGuard::start();
        assert!(!g.is_running());
        g.set_running(true);
        assert!(g.is_running());
        g.set_running(false);
        assert!(!g.is_running());
    }
}
