use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Milliseconds in a clock-specific timeline.
pub type TimestampMs = u64;

/// Injectable clock used by the timer engine.
///
/// `now()` is intended to be backed by an `Instant`-like monotonic source for
/// in-process duration math. `wall_now()` is the timestamp used for persisted
/// deadlines because monotonic instants cannot be serialized and restored after
/// a process crash. Production clocks may choose a wall-clock source for
/// `wall_now()` that advances across sleep/hibernate.
pub trait Clock {
    fn now(&self) -> TimestampMs;

    fn wall_now(&self) -> TimestampMs {
        self.now()
    }
}

/// Process-local monotonic clock for pure engine use.
///
/// This clock intentionally reports the same value for `now()` and `wall_now()`
/// because the minimal library crate has no platform wall-clock dependency. A
/// Tauri integration can inject a clock whose `wall_now()` is UNIX time in
/// milliseconds to restore running timers across process restarts.
#[derive(Debug, Clone)]
pub struct SystemClock {
    started_at: Instant,
}

impl Default for SystemClock {
    fn default() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }
}

impl Clock for SystemClock {
    fn now(&self) -> TimestampMs {
        self.started_at
            .elapsed()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    }
}

/// Runtime clock for persisted timers.
///
/// `wall_now()` is UNIX time in milliseconds so a running timer can be restored
/// after the app exits, sleeps, or resumes.
#[derive(Debug, Clone)]
pub struct WallClock {
    started_at: Instant,
}

impl Default for WallClock {
    fn default() -> Self {
        Self {
            started_at: Instant::now(),
        }
    }
}

impl Clock for WallClock {
    fn now(&self) -> TimestampMs {
        self.started_at
            .elapsed()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    }

    fn wall_now(&self) -> TimestampMs {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .min(u128::from(u64::MAX)) as u64
    }
}
