//! Pure timer engine for the flip cube.
//!
//! The engine stores a deadline (`end_at_ms`) instead of decrementing a counter.
//! Remaining time is computed from the injected [`Clock`] whenever the UI ticks,
//! so ordinary scheduler drift does not accumulate and suspend/resume is handled
//! by the clock source rather than by missed tick counts.
//!
//! Clock strategy: in-process duration math should use an `Instant`-like
//! monotonic value from [`Clock::now`] where possible. Persisted running timers
//! also need a serializable deadline, so this engine stores deadlines in the
//! [`Clock::wall_now`] timeline. A production Tauri adapter can implement
//! `wall_now()` with UNIX time in milliseconds so timers restore correctly after
//! sleep, hibernate, or process restart. Remaining time is always clamped to
//! `[0, duration]`, so large forward or backward clock jumps cannot produce
//! negative or huge UI values.

pub mod clock;

use serde::{Deserialize, Serialize};

pub use clock::{Clock, SystemClock, TimestampMs};

const FACE_COUNT: usize = 6;
const DEFAULT_FACE_MINUTES: [u64; FACE_COUNT] = [5, 15, 25, 45, 60, 10];
const MS_PER_MINUTE: u64 = 60_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimerState {
    Idle,
    Running,
    Paused,
    Finished,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TimerEvent {
    Started,
    Tick { remaining_ms: u64 },
    Paused,
    Resumed,
    Finished,
    Reset,
    FaceChanged { face: usize, duration_ms: u64 },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimerSnapshot {
    pub state: TimerState,
    pub active_face: usize,
    pub duration_ms: u64,
    pub remaining_ms: u64,
    pub end_at_ms: Option<TimestampMs>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimerError {
    InvalidFace { face: usize },
    InvalidDuration { face: usize, duration_ms: u64 },
}

impl std::fmt::Display for TimerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidFace { face } => write!(f, "invalid face index {face}; expected 0..5"),
            Self::InvalidDuration { face, duration_ms } => {
                write!(f, "invalid duration {duration_ms}ms for face {face}")
            }
        }
    }
}

impl std::error::Error for TimerError {}

pub trait TimerEventSink {
    fn emit(&mut self, event: TimerEvent);
}

impl<F> TimerEventSink for F
where
    F: FnMut(TimerEvent),
{
    fn emit(&mut self, event: TimerEvent) {
        self(event);
    }
}

#[derive(Debug, Clone)]
pub struct VecEventSink {
    pub events: Vec<TimerEvent>,
}

impl VecEventSink {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }
}

impl Default for VecEventSink {
    fn default() -> Self {
        Self::new()
    }
}

impl TimerEventSink for VecEventSink {
    fn emit(&mut self, event: TimerEvent) {
        self.events.push(event);
    }
}

#[derive(Debug, Clone)]
pub struct TimerEngine<C> {
    clock: C,
    face_durations_ms: [u64; FACE_COUNT],
    active_face: usize,
    state: TimerState,
    duration_ms: u64,
    remaining_ms: u64,
    end_at_ms: Option<TimestampMs>,
}

impl<C> TimerEngine<C>
where
    C: Clock,
{
    pub fn new(clock: C) -> Self {
        let face_durations_ms = default_face_durations_ms();
        let active_face = 0;
        let duration_ms = face_durations_ms[active_face];

        Self {
            clock,
            face_durations_ms,
            active_face,
            state: TimerState::Idle,
            duration_ms,
            remaining_ms: duration_ms,
            end_at_ms: None,
        }
    }

    pub fn with_face_durations_minutes(
        clock: C,
        face_minutes: [u64; FACE_COUNT],
    ) -> Result<Self, TimerError> {
        let face_durations_ms = face_minutes.map(|minutes| minutes.saturating_mul(MS_PER_MINUTE));
        validate_durations(&face_durations_ms)?;
        let active_face = 0;
        let duration_ms = face_durations_ms[active_face];

        Ok(Self {
            clock,
            face_durations_ms,
            active_face,
            state: TimerState::Idle,
            duration_ms,
            remaining_ms: duration_ms,
            end_at_ms: None,
        })
    }

    pub fn restore(
        clock: C,
        face_durations_ms: [u64; FACE_COUNT],
        snapshot: TimerSnapshot,
    ) -> Result<Self, TimerError> {
        validate_face(snapshot.active_face)?;
        validate_durations(&face_durations_ms)?;

        let mut engine = Self {
            clock,
            face_durations_ms,
            active_face: snapshot.active_face,
            state: snapshot.state,
            duration_ms: snapshot.duration_ms,
            remaining_ms: snapshot.remaining_ms.min(snapshot.duration_ms),
            end_at_ms: snapshot.end_at_ms,
        };

        if engine.duration_ms == 0 {
            return Err(TimerError::InvalidDuration {
                face: engine.active_face,
                duration_ms: engine.duration_ms,
            });
        }

        if engine.state == TimerState::Running {
            engine.remaining_ms = engine.remaining_from_deadline();
            if engine.remaining_ms == 0 {
                engine.state = TimerState::Finished;
                engine.end_at_ms = None;
            }
        } else if engine.state == TimerState::Finished {
            engine.remaining_ms = 0;
            engine.end_at_ms = None;
        } else {
            engine.end_at_ms = None;
        }

        Ok(engine)
    }

    pub fn state(&self) -> TimerState {
        self.state
    }

    pub fn active_face(&self) -> usize {
        self.active_face
    }

    pub fn duration_ms(&self) -> u64 {
        self.duration_ms
    }

    pub fn end_at_ms(&self) -> Option<TimestampMs> {
        self.end_at_ms
    }

    pub fn should_run_tick_task(&self) -> bool {
        self.state == TimerState::Running
    }

    pub fn remaining_ms(&self) -> u64 {
        if self.state == TimerState::Running {
            self.remaining_from_deadline()
        } else {
            self.remaining_ms
        }
    }

    pub fn snapshot(&self) -> TimerSnapshot {
        TimerSnapshot {
            state: self.state,
            active_face: self.active_face,
            duration_ms: self.duration_ms,
            remaining_ms: self.remaining_ms(),
            end_at_ms: self.end_at_ms,
        }
    }

    pub fn start(&mut self) -> Vec<TimerEvent> {
        self.start_current_face(TimerEvent::Started)
    }

    pub fn start_face(&mut self, face: usize) -> Result<Vec<TimerEvent>, TimerError> {
        self.change_face(face)?;
        Ok(self.start_current_face(TimerEvent::Started))
    }

    pub fn set_face(&mut self, face: usize) -> Result<Vec<TimerEvent>, TimerError> {
        validate_face(face)?;
        if face == self.active_face {
            return Ok(Vec::new());
        }

        self.change_face(face)?;
        let face_event = TimerEvent::FaceChanged {
            face: self.active_face,
            duration_ms: self.duration_ms,
        };

        if self.state == TimerState::Running {
            let mut events = vec![face_event];
            events.extend(self.start_current_face(TimerEvent::Started));
            Ok(events)
        } else {
            self.state = TimerState::Idle;
            self.remaining_ms = self.duration_ms;
            self.end_at_ms = None;
            Ok(vec![face_event])
        }
    }

    pub fn tap(&mut self) -> Vec<TimerEvent> {
        match self.state {
            TimerState::Running => self.pause(),
            TimerState::Paused => self.resume(),
            TimerState::Idle | TimerState::Finished => Vec::new(),
        }
    }

    pub fn pause(&mut self) -> Vec<TimerEvent> {
        if self.state != TimerState::Running {
            return Vec::new();
        }

        self.remaining_ms = self.remaining_from_deadline();
        self.end_at_ms = None;
        self.state = TimerState::Paused;
        vec![TimerEvent::Paused]
    }

    pub fn resume(&mut self) -> Vec<TimerEvent> {
        if self.state != TimerState::Paused {
            return Vec::new();
        }

        if self.remaining_ms == 0 {
            self.state = TimerState::Finished;
            return vec![TimerEvent::Finished];
        }

        self.end_at_ms = Some(self.clock.wall_now().saturating_add(self.remaining_ms));
        self.state = TimerState::Running;
        vec![TimerEvent::Resumed]
    }

    pub fn reset(&mut self) -> Vec<TimerEvent> {
        self.state = TimerState::Idle;
        self.duration_ms = self.face_durations_ms[self.active_face];
        self.remaining_ms = self.duration_ms;
        self.end_at_ms = None;
        vec![TimerEvent::Reset]
    }

    pub fn tick(&mut self) -> Vec<TimerEvent> {
        if self.state != TimerState::Running {
            return Vec::new();
        }

        let remaining_ms = self.remaining_from_deadline();
        if remaining_ms == 0 {
            self.remaining_ms = 0;
            self.end_at_ms = None;
            self.state = TimerState::Finished;
            vec![TimerEvent::Finished]
        } else {
            self.remaining_ms = remaining_ms;
            vec![TimerEvent::Tick { remaining_ms }]
        }
    }

    pub fn dispatch_tick(&mut self, sink: &mut impl TimerEventSink) {
        for event in self.tick() {
            sink.emit(event);
        }
    }

    fn start_current_face(&mut self, event: TimerEvent) -> Vec<TimerEvent> {
        self.duration_ms = self.face_durations_ms[self.active_face];
        self.remaining_ms = self.duration_ms;
        self.end_at_ms = Some(self.clock.wall_now().saturating_add(self.duration_ms));
        self.state = TimerState::Running;
        vec![event]
    }

    fn change_face(&mut self, face: usize) -> Result<(), TimerError> {
        validate_face(face)?;
        self.active_face = face;
        self.duration_ms = self.face_durations_ms[face];
        self.remaining_ms = self.duration_ms;
        Ok(())
    }

    fn remaining_from_deadline(&self) -> u64 {
        match self.end_at_ms {
            Some(end_at_ms) => end_at_ms
                .saturating_sub(self.clock.wall_now())
                .min(self.duration_ms),
            None => self.remaining_ms,
        }
    }
}

pub fn default_face_durations_ms() -> [u64; FACE_COUNT] {
    DEFAULT_FACE_MINUTES.map(|minutes| minutes * MS_PER_MINUTE)
}

fn validate_face(face: usize) -> Result<(), TimerError> {
    if face < FACE_COUNT {
        Ok(())
    } else {
        Err(TimerError::InvalidFace { face })
    }
}

fn validate_durations(face_durations_ms: &[u64; FACE_COUNT]) -> Result<(), TimerError> {
    for (face, duration_ms) in face_durations_ms.iter().copied().enumerate() {
        if duration_ms == 0 {
            return Err(TimerError::InvalidDuration { face, duration_ms });
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::rc::Rc;

    #[derive(Debug, Clone)]
    struct ManualClock {
        now_ms: Rc<Cell<u64>>,
        wall_ms: Rc<Cell<u64>>,
    }

    impl ManualClock {
        fn new() -> Self {
            Self {
                now_ms: Rc::new(Cell::new(0)),
                wall_ms: Rc::new(Cell::new(0)),
            }
        }

        fn advance_both(&self, ms: u64) {
            self.now_ms.set(self.now_ms.get().saturating_add(ms));
            self.advance_wall(ms);
        }

        fn advance_wall(&self, ms: u64) {
            self.wall_ms.set(self.wall_ms.get().saturating_add(ms));
        }

        fn set_wall(&self, ms: u64) {
            self.wall_ms.set(ms);
        }
    }

    impl Clock for ManualClock {
        fn now(&self) -> TimestampMs {
            self.now_ms.get()
        }

        fn wall_now(&self) -> TimestampMs {
            self.wall_ms.get()
        }
    }

    fn test_engine(clock: ManualClock) -> TimerEngine<ManualClock> {
        TimerEngine::with_face_durations_minutes(clock, [1, 2, 3, 4, 5, 10]).unwrap()
    }

    #[test]
    fn start_pause_resume_and_reset() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());

        assert_eq!(timer.state(), TimerState::Idle);
        assert_eq!(timer.remaining_ms(), 60_000);

        assert_eq!(timer.start(), vec![TimerEvent::Started]);
        assert!(timer.should_run_tick_task());
        clock.advance_both(10_000);
        assert_eq!(timer.remaining_ms(), 50_000);

        assert_eq!(timer.tap(), vec![TimerEvent::Paused]);
        assert_eq!(timer.state(), TimerState::Paused);
        assert!(!timer.should_run_tick_task());
        assert_eq!(timer.remaining_ms(), 50_000);

        clock.advance_both(30_000);
        assert_eq!(timer.remaining_ms(), 50_000);

        assert_eq!(timer.tap(), vec![TimerEvent::Resumed]);
        assert_eq!(timer.state(), TimerState::Running);
        clock.advance_both(20_000);
        assert_eq!(timer.remaining_ms(), 30_000);

        assert_eq!(timer.reset(), vec![TimerEvent::Reset]);
        assert_eq!(timer.state(), TimerState::Idle);
        assert!(!timer.should_run_tick_task());
        assert_eq!(timer.remaining_ms(), 60_000);
        assert_eq!(timer.end_at_ms(), None);
    }

    #[test]
    fn flip_while_running_restarts_with_new_face_duration() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());

        timer.start();
        clock.advance_both(20_000);
        let events = timer.set_face(2).unwrap();

        assert_eq!(
            events,
            vec![
                TimerEvent::FaceChanged {
                    face: 2,
                    duration_ms: 180_000
                },
                TimerEvent::Started
            ]
        );
        assert_eq!(timer.active_face(), 2);
        assert_eq!(timer.state(), TimerState::Running);
        assert_eq!(timer.remaining_ms(), 180_000);

        clock.advance_both(1_000);
        assert_eq!(timer.remaining_ms(), 179_000);
    }

    #[test]
    fn running_timer_finishes_on_tick() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());

        timer.start();
        clock.advance_both(59_999);
        assert_eq!(timer.tick(), vec![TimerEvent::Tick { remaining_ms: 1 }]);

        clock.advance_both(1);
        assert_eq!(timer.tick(), vec![TimerEvent::Finished]);
        assert_eq!(timer.state(), TimerState::Finished);
        assert_eq!(timer.remaining_ms(), 0);
        assert!(!timer.should_run_tick_task());
    }

    #[test]
    fn wall_clock_progress_handles_sleep_resume() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());

        timer.start();
        clock.advance_wall(45_000);

        assert_eq!(timer.remaining_ms(), 15_000);
        assert_eq!(
            timer.tick(),
            vec![TimerEvent::Tick {
                remaining_ms: 15_000
            }]
        );

        clock.advance_wall(20_000);
        assert_eq!(timer.tick(), vec![TimerEvent::Finished]);
        assert_eq!(timer.state(), TimerState::Finished);
    }

    #[test]
    fn large_clock_jumps_are_clamped() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());

        timer.start();
        clock.advance_wall(1_000_000_000);
        assert_eq!(timer.remaining_ms(), 0);
        assert_eq!(timer.tick(), vec![TimerEvent::Finished]);

        timer.reset();
        timer.start();
        clock.set_wall(0);
        assert_eq!(timer.remaining_ms(), 60_000);
    }

    #[test]
    fn tick_drift_does_not_accumulate() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());

        timer.start();
        for _ in 0..3 {
            clock.advance_both(333);
            timer.tick();
        }

        assert_eq!(timer.remaining_ms(), 59_001);

        clock.advance_both(1);
        assert_eq!(
            timer.tick(),
            vec![TimerEvent::Tick {
                remaining_ms: 59_000
            }]
        );
    }

    #[test]
    fn restore_after_crash_from_running_snapshot() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());

        timer.set_face(5).unwrap();
        timer.start();
        clock.advance_wall(120_000);
        let snapshot = timer.snapshot();

        assert_eq!(snapshot.state, TimerState::Running);
        assert_eq!(snapshot.active_face, 5);
        assert_eq!(snapshot.duration_ms, 600_000);
        assert_eq!(snapshot.remaining_ms, 480_000);
        assert_eq!(snapshot.end_at_ms, Some(600_000));

        let restored_clock = clock.clone();
        restored_clock.advance_wall(180_000);
        let restored = TimerEngine::restore(
            restored_clock,
            [60_000, 120_000, 180_000, 240_000, 300_000, 600_000],
            snapshot,
        )
        .unwrap();

        assert_eq!(restored.state(), TimerState::Running);
        assert_eq!(restored.active_face(), 5);
        assert_eq!(restored.remaining_ms(), 300_000);
        assert!(restored.should_run_tick_task());
    }

    #[test]
    fn restore_expired_running_snapshot_finishes() {
        let clock = ManualClock::new();
        let snapshot = TimerSnapshot {
            state: TimerState::Running,
            active_face: 0,
            duration_ms: 60_000,
            remaining_ms: 60_000,
            end_at_ms: Some(10_000),
        };

        clock.advance_wall(10_001);
        let restored = TimerEngine::restore(
            clock,
            [60_000, 120_000, 180_000, 240_000, 300_000, 600_000],
            snapshot,
        )
        .unwrap();

        assert_eq!(restored.state(), TimerState::Finished);
        assert_eq!(restored.remaining_ms(), 0);
        assert!(!restored.should_run_tick_task());
    }

    #[test]
    fn dispatch_tick_uses_optional_event_sink() {
        let clock = ManualClock::new();
        let mut timer = test_engine(clock.clone());
        let mut sink = VecEventSink::new();

        timer.start();
        clock.advance_both(1_500);
        timer.dispatch_tick(&mut sink);

        assert_eq!(
            sink.events,
            vec![TimerEvent::Tick {
                remaining_ms: 58_500
            }]
        );
    }
}
