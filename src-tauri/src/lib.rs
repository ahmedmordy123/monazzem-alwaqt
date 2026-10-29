pub mod monitor;
pub mod storage;
pub mod timer;

#[cfg(feature = "app")]
pub mod commands;

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
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let state_path = default_state_path(&app_data_dir);
            app.manage(AppState::new(state_path));
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running flip-cube-timer");
}
