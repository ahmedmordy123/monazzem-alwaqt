use crate::{commands, desktop_text::tray_labels, storage::Language};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

const SHOW_ID: &str = "show";
const PAUSE_ID: &str = "pause";
const RESET_ID: &str = "reset";
const MODE_ID: &str = "mode";
const QUIT_ID: &str = "quit";

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let labels = app
        .try_state::<commands::AppState>()
        .and_then(|state| state.snapshot().ok())
        .map(|snapshot| tray_labels(snapshot.settings.language))
        .unwrap_or_else(|| tray_labels(Language::Ar));

    let show = MenuItem::with_id(app, SHOW_ID, labels.show, true, None::<&str>)?;
    let pause = MenuItem::with_id(app, PAUSE_ID, labels.pause, true, None::<&str>)?;
    let reset = MenuItem::with_id(app, RESET_ID, labels.reset, true, None::<&str>)?;
    let mode = MenuItem::with_id(app, MODE_ID, labels.mode, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_ID, labels.quit, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &pause, &reset, &mode, &separator, &quit])?;

    TrayIconBuilder::new()
        .tooltip("منظم الوقت")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            let result = match event.id().as_ref() {
                SHOW_ID => commands::focus_main_window(app),
                PAUSE_ID => commands::tray_toggle_pause(app),
                RESET_ID => commands::tray_reset(app),
                MODE_ID => commands::tray_toggle_mode(app),
                QUIT_ID => {
                    app.exit(0);
                    Ok(())
                }
                _ => Ok(()),
            };
            if let Err(error) = result {
                if let Some(state) = app.try_state::<commands::AppState>() {
                    state.log_line(format!("tray_error {error}"));
                }
            }
        })
        .build(app)?;

    Ok(())
}
