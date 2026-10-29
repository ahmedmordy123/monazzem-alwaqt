use crate::{
    desktop_text::remaining_time_text,
    display_mode,
    logging::RotatingFileLog,
    monitor::{self, MonitorInfo},
    storage::{self, AppSettings, DisplayMode, PersistedState},
    timer::{
        clock::WallClock, default_face_durations_ms, TimerEngine, TimerEvent, TimerSnapshot,
        TimerState,
    },
    wake::WakeGuard,
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
use tauri_plugin_notification::NotificationExt;

const TICK_INTERVAL_MS: u64 = 250;
const FACE_COUNT: usize = 6;

pub struct AppState {
    inner: Mutex<InnerState>,
    tick_task_active: AtomicBool,
    state_path: PathBuf,
    wake: WakeGuard,
    log: RotatingFileLog,
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
pub struct FinishedPayload {
    pub remaining_text: String,
    pub sound_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub timer: TimerSnapshot,
    pub settings: AppSettings,
}

impl AppState {
    pub fn new(state_path: PathBuf, log_path: PathBuf) -> Self {
        let persisted = storage::load_state(&state_path);
        let settings = persisted.settings.sanitized();
        let timer = TimerEngine::restore(
            WallClock::default(),
            settings.face_durations_ms(),
            persisted.timer,
        )
        .unwrap_or_else(|_| {
            TimerEngine::restore(
                WallClock::default(),
                default_face_durations_ms(),
                PersistedState::default().timer,
            )
            .unwrap_or_else(|_| TimerEngine::new(WallClock::default()))
        });

        let wake = WakeGuard::start();
        wake.set_running(timer.state() == TimerState::Running);
        let log = RotatingFileLog::new(log_path, 1_048_576);
        let _ = log.append("startup");
        Self {
            inner: Mutex::new(InnerState { timer, settings }),
            tick_task_active: AtomicBool::new(false),
            state_path,
            wake,
            log,
        }
    }

    fn sync_wake(&self, running: bool) {
        self.wake.set_running(running);
    }

    pub(crate) fn log_line(&self, line: impl AsRef<str>) {
        let _ = self.log.append(line);
    }

    pub(crate) fn snapshot(&self) -> Result<AppSnapshot, String> {
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
        (
            inner.timer.snapshot(),
            events,
            inner.timer.should_run_tick_task(),
        )
    };
    emit_events(&app, &events, &snapshot)?;
    state.sync_wake(should_tick);
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
    state.sync_wake(false);
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
        let events = inner
            .timer
            .set_face(face)
            .map_err(|error| error.to_string())?;
        state.persist_locked(&inner)?;
        (
            inner.timer.snapshot(),
            events,
            inner.timer.should_run_tick_task(),
        )
    };
    emit_events(&app, &events, &snapshot)?;
    state.sync_wake(should_tick);
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
        let mut events = inner
            .timer
            .set_face(face)
            .map_err(|error| error.to_string())?;
        if inner.timer.state() != TimerState::Running {
            events.extend(inner.timer.start());
        }
        state.persist_locked(&inner)?;
        (inner.timer.snapshot(), events)
    };
    emit_events(&app, &events, &snapshot)?;
    state.sync_wake(true);
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
    display_mode::list_monitors(&app)
}

#[tauri::command]
pub fn set_display_mode(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    mode: DisplayMode,
) -> Result<AppSnapshot, String> {
    set_display_mode_inner(&app, &state, mode)
}

#[tauri::command]
pub fn apply_monitor(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    monitor_id: String,
) -> Result<AppSnapshot, String> {
    let monitors = display_mode::list_monitors(&app)?;
    let monitor = monitors
        .iter()
        .find(|monitor| monitor.id == monitor_id || monitor.fingerprint_key() == monitor_id)
        .ok_or_else(|| "monitor not found".to_string())?;
    let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
    inner.settings.target_monitor_id = Some(monitor.fingerprint_key());
    inner.settings.display_mode = DisplayMode::DeskCube;
    display_mode::apply_display_mode(
        &app,
        inner.settings.display_mode,
        Some(monitor),
        inner.settings.widget_position,
    )?;
    state.persist_locked(&inner)?;
    state.log_line(format!("apply_monitor {}", monitor.fingerprint_key()));
    Ok(AppSnapshot {
        timer: inner.timer.snapshot(),
        settings: inner.settings.clone(),
    })
}

#[tauri::command]
pub fn hotkey_flip(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<TimerSnapshot, String> {
    flip_next_inner(&app, &state)
}

#[tauri::command]
pub fn hotkey_pause(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<TimerSnapshot, String> {
    tap(app, state)
}

#[tauri::command]
pub fn hotkey_reset(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<TimerSnapshot, String> {
    reset(app, state)
}

#[tauri::command]
pub fn hotkey_mode(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<AppSnapshot, String> {
    toggle_display_mode_inner(&app, &state)
}

pub fn focus_main_window(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    window.show().map_err(|error| error.to_string())?;
    window.set_focus().map_err(|error| error.to_string())
}

pub fn tray_toggle_pause(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _ = tap(app.clone(), state)?;
    Ok(())
}

pub fn tray_reset(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _ = reset(app.clone(), state)?;
    Ok(())
}

pub fn tray_flip_next(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _ = flip_next_inner(app, &state)?;
    Ok(())
}

pub fn tray_toggle_mode(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _ = toggle_display_mode_inner(app, &state)?;
    Ok(())
}

fn flip_next_inner(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
) -> Result<TimerSnapshot, String> {
    let (snapshot, events, should_tick) = {
        let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        let next = (inner.timer.active_face() + 1) % FACE_COUNT;
        let mut events = inner
            .timer
            .set_face(next)
            .map_err(|error| error.to_string())?;
        if inner.timer.state() != TimerState::Running {
            events.extend(inner.timer.start());
        }
        state.persist_locked(&inner)?;
        (
            inner.timer.snapshot(),
            events,
            inner.timer.should_run_tick_task(),
        )
    };
    emit_events(app, &events, &snapshot)?;
    state.sync_wake(should_tick);
    if should_tick {
        ensure_tick_task(app.clone());
    }
    state.log_line(format!("hotkey_flip face={}", snapshot.active_face));
    Ok(snapshot)
}

fn set_display_mode_inner(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
    mode: DisplayMode,
) -> Result<AppSnapshot, String> {
    let monitors = display_mode::list_monitors(app)?;
    let mut inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
    let monitor = monitor_for_settings(&monitors, &inner.settings);
    let widget_position =
        display_mode::apply_display_mode(app, mode, monitor, inner.settings.widget_position)?;
    inner.settings.display_mode = mode;
    if widget_position.is_some() {
        inner.settings.widget_position = widget_position;
    }
    state.persist_locked(&inner)?;
    state.log_line(format!("set_display_mode {:?}", mode));
    Ok(AppSnapshot {
        timer: inner.timer.snapshot(),
        settings: inner.settings.clone(),
    })
}

fn toggle_display_mode_inner(
    app: &AppHandle,
    state: &tauri::State<'_, AppState>,
) -> Result<AppSnapshot, String> {
    let mode = {
        let inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        match inner.settings.display_mode {
            DisplayMode::DeskCube => DisplayMode::Widget,
            DisplayMode::Widget => DisplayMode::DeskCube,
        }
    };
    set_display_mode_inner(app, state, mode)
}

fn monitor_for_settings<'a>(
    monitors: &'a [MonitorInfo],
    settings: &AppSettings,
) -> Option<&'a MonitorInfo> {
    monitor::match_target(monitors, settings.target_monitor_id.as_deref(), None)
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
        state.sync_wake(keep_running);

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
        if matches!(event, TimerEvent::Finished) {
            notify_finished(app, snapshot)?;
        }
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

fn notify_finished(app: &AppHandle, snapshot: &TimerSnapshot) -> Result<(), String> {
    let state = app.state::<AppState>();
    let settings = {
        let inner = state.inner.lock().map_err(|_| "app state lock poisoned")?;
        inner.settings.clone()
    };
    let remaining_text = remaining_time_text(settings.language, snapshot.remaining_ms);
    state.log_line(format!("timer_finished face={}", snapshot.active_face));
    app.emit(
        "timer-finished",
        FinishedPayload {
            remaining_text: remaining_text.clone(),
            sound_path: settings.sound_path.clone(),
        },
    )
    .map_err(|error| error.to_string())?;
    if settings.sound_enabled {
        let body = match settings.language {
            crate::storage::Language::Ar => "انتهى الوقت — اضغط للإيقاف",
            crate::storage::Language::En => "Time's up — tap to dismiss",
        };
        app.notification()
            .builder()
            .title("منظم الوقت")
            .body(body)
            .silent()
            .show()
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}
