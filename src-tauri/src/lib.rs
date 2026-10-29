pub mod desktop_text;
pub mod logging;
pub mod monitor;
pub mod storage;
pub mod timer;
pub mod wake;

#[cfg(feature = "app")]
pub mod commands;
#[cfg(feature = "app")]
pub mod display_mode;
#[cfg(feature = "app")]
pub mod tray;

#[cfg(feature = "app")]
use commands::AppState;
#[cfg(feature = "app")]
use storage::default_state_path;
#[cfg(feature = "app")]
use tauri::Manager;

#[cfg(feature = "app")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            let _ = commands::focus_main_window(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let state_path = default_state_path(&app_data_dir);
            let log_path = app_data_dir.join("logs").join("flip-cube-timer.log");
            app.manage(AppState::new(state_path, log_path));
            tray::install(app.handle())?;
            let _ = commands::bootstrap_tick_task(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::tap,
            commands::reset,
            commands::set_face,
            commands::flip_settle,
            commands::get_settings,
            commands::save_settings,
            commands::list_monitors,
            commands::set_display_mode,
            commands::apply_monitor,
            commands::hotkey_flip,
            commands::hotkey_pause,
            commands::hotkey_reset,
            commands::hotkey_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running flip-cube-timer");
}
