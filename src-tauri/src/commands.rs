use crate::{
    monitor::{self, MonitorInfo},
    storage::{self, AppSettings, PersistedState},
    timer::{
        clock::WallClock, default_face_durations_ms, TimerEngine, TimerEvent, TimerSnapshot,
        TimerState,
    },
};
use serde::Serialize;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

const TICK_INTERVAL_MS: u64 = 250;

pub struct AppState {
    inner: Mutex<InnerState>,
    tick_task_active: AtomicBool,
    state_path: PathBuf,
}

struct InnerState {
    timer: TimerEngine<WallClock>,
    settings: AppSettings,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerPayload {
    pub event: TimerEvent,
    pub snapshot: TimerSnapshot,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub timer: TimerSnapshot,
    pub settings: AppSettings,
}

impl AppState {
    pub fn new(state_path: PathBuf) -> Self {
        let persisted = storage::load_state(&state_path);
        let settings = persisted.settings.sanitized();
        let timer = TimerEngine::restore(
            WallClock::default(),
            settings.face_durations_ms(),
            persisted.timer,
        )
        .unwrap_or_else(|_| TimerEngine::restore(
            WallClock::default(),
            default_face_durations_ms(),
            PersistedState::default().timer,
        )
        .expect("default timer snapshot is valid"));

        Self {
            inner: Mutex::new(InnerState { timer, settings }),
            tick_task_active: AtomicBool::new(false),
            state_path,
        }
    }

    fn snapshot(&self) -> Result<AppSnapshot, String> {
        let inner = self.inner.lock().map_err(|_| "app state lock poisoned")?;
        Ok(AppSnapshot {
            timer: inner.timer.snapshot(),
            settings: inner.settings.clone(),
        })
    }

    fn persist_locked(&self, inner: &InnerState) -> Result<(), String> {
        storage::save_state(
            &self.state_path,
            &PersistedState {
                settings: inner.settings.clone(),
                timer: inner.timer.snapshot(),
            },
        )
        .map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn get_state(state: tauri::State<'_, AppState>) -> Result<AppSnapshot, String> {
    state.snapshot()
}

#[tauri::command]
pub fn tap(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<TimerSnapshot, String> {
    let (snapshot, events, should_tick) = {
        let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        let events = inner.timer.tap();
        state.persist_locked(&inner)?;
        (inner.timer.snapshot(), events, inner.timer.should_run_tick_task())
    };
    emit_events(&app, &events, &snapshot)?;
    if should_tick {
        ensure_tick_task(app);
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn reset(app: AppHandle, state: tauri::State<'_, AppState>) -> Result<TimerSnapshot, String> {
    let (snapshot, events) = {
        let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        let events = inner.timer.reset();
        state.persist_locked(&inner)?;
        (inner.timer.snapshot(), events)
    };
    emit_events(&app, &events, &snapshot)?;
    Ok(snapshot)
}

#[tauri::command]
pub fn set_face(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    face: usize,
) -> Result<TimerSnapshot, String> {
    let (snapshot, events, should_tick) = {
        let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        let events = inner.timer.set_face(face).map_err(|error| error.to_string())?;
        state.persist_locked(&inner)?;
        (inner.timer.snapshot(), events, inner.timer.should_run_tick_task())
    };
    emit_events(&app, &events, &snapshot)?;
    if should_tick {
        ensure_tick_task(app);
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn flip_settle(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    face: usize,
) -> Result<TimerSnapshot, String> {
    let (snapshot, events) = {
        let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        let mut events = inner.timer.set_face(face).map_err(|error| error.to_string())?;
        if inner.timer.state() != TimerState::Running {
            events.extend(inner.timer.start());
        }
        state.persist_locked(&inner)?;
        (inner.timer.snapshot(), events)
    };
    emit_events(&app, &events, &snapshot)?;
    ensure_tick_task(app);
    Ok(snapshot)
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, AppState>) -> Result<AppSettings, String> {
    let inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
    Ok(inner.settings.clone())
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    settings: AppSettings,
) -> Result<AppSnapshot, String> {
    let (snapshot, should_tick) = {
        let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        inner.settings = settings.sanitized();
        let snapshot = inner.timer.snapshot();
        inner.timer = TimerEngine::restore(
            WallClock::default(),
            inner.settings.face_durations_ms(),
            snapshot,
        )
        .map_err(|error| error.to_string())?;
        state.persist_locked(&inner)?;
        (
            AppSnapshot {
                timer: inner.timer.snapshot(),
                settings: inner.settings.clone(),
            },
            inner.timer.should_run_tick_task(),
        )
    };
    if should_tick {
        ensure_tick_task(app);
    }
    Ok(snapshot)
}

#[tauri::command]
pub fn list_monitors(app: AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let monitors = app
        .available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let size = monitor.size();
            let position = monitor.position();
            let scale_factor = monitor.scale_factor();
            let id = monitor::fingerprint(
                size.width,
                size.height,
                scale_factor,
                position.x,
                position.y,
            );
            MonitorInfo {
                id: format!("monitor-{index}-{id}"),
                name: monitor.name().map(ToOwned::to_owned),
                width: size.width,
                height: size.height,
                scale_factor,
                x: position.x,
                y: position.y,
            }
        })
        .collect();
    Ok(monitors)
}

pub fn bootstrap_tick_task(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.snapshot()?.timer.state == TimerState::Running {
        ensure_tick_task(app.clone());
    }
    Ok(())
}

fn ensure_tick_task(app: AppHandle) {
    let state = app.state::<AppState>();
    if state
        .tick_task_active
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }

    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(TICK_INTERVAL_MS));
        let state = app.state::<AppState>();
        let (snapshot, events, keep_running) = {
            let mut inner = match state.inner.lock() {
                Ok(inner) => inner,
                Err(_) => break,
            };
            let events = inner.timer.tick();
            let snapshot = inner.timer.snapshot();
            let keep_running = inner.timer.should_run_tick_task();
            if !events.is_empty() {
                let _ = state.persist_locked(&inner);
            }
            (snapshot, events, keep_running)
        };

        let _ = emit_events(&app, &events, &snapshot);

        if !keep_running {
            state.tick_task_active.store(false, Ordering::SeqCst);
            break;
        }
    });
}

fn emit_events(
    app: &AppHandle,
    events: &[TimerEvent],
    snapshot: &TimerSnapshot,
) -> Result<(), String> {
    for event in events {
        app.emit(
            "timer-event",
            TimerPayload {
                event: event.clone(),
                snapshot: snapshot.clone(),
            },
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(())
}
