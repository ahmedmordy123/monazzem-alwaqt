//! Atomic JSON state persistence (temp + rename + `.bak`).

use crate::timer::{TimerSnapshot, TimerState};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};
use thiserror::Error;

const FACE_COUNT: usize = 6;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    White,
    Black,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Ar,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    Angled,
    Flat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DisplayMode {
    DeskCube,
    Widget,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct WidgetPosition {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct NudgeOffsets {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub face_minutes: [u64; FACE_COUNT],
    pub theme: Theme,
    pub language: Language,
    pub sound_enabled: bool,
    pub sound_path: Option<String>,
    pub view_mode: ViewMode,
    pub display_mode: DisplayMode,
    pub yaw: f64,
    pub pitch: f64,
    pub perspective_factor: f64,
    pub perf_mode: bool,
    pub autostart: bool,
    pub target_monitor_id: Option<String>,
    pub widget_position: Option<WidgetPosition>,
    pub idle_dim_minutes: u64,
    pub nudge_offsets: NudgeOffsets,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            face_minutes: [5, 15, 25, 45, 60, 10],
            theme: Theme::White,
            language: Language::Ar,
            sound_enabled: true,
            sound_path: None,
            view_mode: ViewMode::Angled,
            display_mode: DisplayMode::DeskCube,
            yaw: -22.0,
            pitch: -19.0,
            perspective_factor: 4.2,
            perf_mode: false,
            autostart: false,
            target_monitor_id: None,
            widget_position: None,
            idle_dim_minutes: 10,
            nudge_offsets: NudgeOffsets { x: 8, y: 8 },
        }
    }
}

impl AppSettings {
    pub fn sanitized(mut self) -> Self {
        for minutes in &mut self.face_minutes {
            *minutes = (*minutes).clamp(1, 180);
        }
        self.perspective_factor = self.perspective_factor.clamp(3.0, 5.0);
        if !self.yaw.is_finite() {
            self.yaw = -22.0;
        }
        if !self.pitch.is_finite() {
            self.pitch = -19.0;
        }
        if !self.perspective_factor.is_finite() {
            self.perspective_factor = 4.2;
        }
        self.idle_dim_minutes = self.idle_dim_minutes.min(240);
        self.nudge_offsets.x = self.nudge_offsets.x.clamp(-64, 64);
        self.nudge_offsets.y = self.nudge_offsets.y.clamp(-64, 64);
        self
    }

    pub fn face_durations_ms(&self) -> [u64; FACE_COUNT] {
        self.face_minutes.map(|minutes| minutes * 60_000)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PersistedState {
    pub settings: AppSettings,
    pub timer: TimerSnapshot,
}

impl Default for PersistedState {
    fn default() -> Self {
        let settings = AppSettings::default();
        let duration_ms = settings.face_minutes[0] * 60_000;
        Self {
            settings,
            timer: TimerSnapshot {
                state: TimerState::Idle,
                active_face: 0,
                duration_ms,
                remaining_ms: duration_ms,
                end_at_ms: None,
            },
        }
    }
}

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("failed to create settings directory: {0}")]
    CreateDir(io::Error),
    #[error("failed to serialize settings: {0}")]
    Serialize(serde_json::Error),
    #[error("failed to write settings: {0}")]
    Write(io::Error),
    #[error("failed to replace settings file: {0}")]
    Replace(io::Error),
}

pub fn default_state_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("state.json")
}

fn parse_state(raw: &str) -> Option<PersistedState> {
    serde_json::from_str::<PersistedState>(raw)
        .ok()
        .map(|mut state| {
            state.settings = state.settings.sanitized();
            state
        })
}

pub fn load_state(path: &Path) -> PersistedState {
    if let Ok(raw) = fs::read_to_string(path) {
        if let Some(state) = parse_state(&raw) {
            return state;
        }
    }
    let bak = backup_path(path);
    if let Ok(raw) = fs::read_to_string(bak) {
        if let Some(state) = parse_state(&raw) {
            return state;
        }
    }
    PersistedState::default()
}

pub fn save_state(path: &Path, state: &PersistedState) -> Result<(), StorageError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(StorageError::CreateDir)?;
    }

    if path.exists() {
        let backup = backup_path(path);
        let _ = fs::copy(path, backup);
    }

    let tmp_path = temp_path(path);
    let data = serde_json::to_vec_pretty(state).map_err(StorageError::Serialize)?;
    {
        let mut file = fs::File::create(&tmp_path).map_err(StorageError::Write)?;
        file.write_all(&data).map_err(StorageError::Write)?;
        file.write_all(b"\n").map_err(StorageError::Write)?;
        file.sync_all().map_err(StorageError::Write)?;
    }

    // On Windows, rename over existing can fail — remove then rename.
    if path.exists() {
        fs::remove_file(path).map_err(StorageError::Replace)?;
    }
    fs::rename(&tmp_path, path).map_err(StorageError::Replace)?;
    // Keep `.bak` as last-known-good (including first write).
    let _ = fs::copy(path, backup_path(path));
    Ok(())
}

fn backup_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.bak", path.display()))
}

fn temp_path(path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.tmp", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn missing_file_loads_defaults() {
        let dir = tempdir().unwrap();
        let state = load_state(&dir.path().join("missing.json"));
        assert_eq!(state.settings, AppSettings::default());
        assert_eq!(state.timer.state, TimerState::Idle);
        assert_eq!(state.timer.remaining_ms, 300_000);
    }

    #[test]
    fn corrupt_file_loads_defaults() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("state.json");
        fs::write(&path, "{not-json").unwrap();
        let state = load_state(&path);
        assert_eq!(state, PersistedState::default());
    }

    #[test]
    fn bak_used_when_primary_corrupt() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("state.json");
        let mut state = PersistedState::default();
        state.settings.theme = Theme::Black;
        save_state(&path, &state).unwrap();
        fs::write(&path, "CORRUPT").unwrap();
        let loaded = load_state(&path);
        assert_eq!(loaded.settings.theme, Theme::Black);
    }

    #[test]
    fn save_is_readable_and_creates_backup() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("state.json");
        let mut state = PersistedState::default();
        state.settings.theme = Theme::Black;
        save_state(&path, &state).unwrap();
        state.settings.theme = Theme::White;
        save_state(&path, &state).unwrap();
        assert_eq!(load_state(&path), state);
        assert!(backup_path(&path).exists());
        assert!(!temp_path(&path).exists());
    }

    #[test]
    fn settings_are_sanitized_on_load() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("state.json");
        let mut state = PersistedState::default();
        state.settings.face_minutes = [0, 181, 25, 45, 60, 10];
        state.settings.perspective_factor = 99.0;
        fs::write(&path, serde_json::to_string(&state).unwrap()).unwrap();
        let loaded = load_state(&path);
        assert_eq!(loaded.settings.face_minutes[0], 1);
        assert_eq!(loaded.settings.face_minutes[1], 180);
        assert_eq!(loaded.settings.perspective_factor, 5.0);
    }
}
