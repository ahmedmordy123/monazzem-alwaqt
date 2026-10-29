use crate::{
    monitor::{self, MonitorInfo},
    storage::{DisplayMode, WidgetPosition},
};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Size};

const MAIN_WINDOW: &str = "main";
const WIDGET_SIZE: u32 = 220;

pub fn list_monitors(app: &AppHandle) -> Result<Vec<MonitorInfo>, String> {
    let primary_name = app
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .and_then(|monitor| monitor.name().map(ToOwned::to_owned));

    app.available_monitors()
        .map_err(|error| error.to_string())?
        .into_iter()
        .enumerate()
        .map(|(index, monitor)| {
            let size = monitor.size();
            let position = monitor.position();
            let scale = monitor.scale_factor();
            let name = monitor.name().map(ToOwned::to_owned);
            let id = monitor::fingerprint(size.width, size.height, scale, position.x, position.y);
            Ok(MonitorInfo {
                id: format!("monitor-{index}-{id}"),
                is_primary: primary_name
                    .as_ref()
                    .zip(name.as_ref())
                    .is_some_and(|(primary, current)| primary == current),
                name,
                width: size.width,
                height: size.height,
                scale,
                x: position.x,
                y: position.y,
            })
        })
        .collect()
}

pub fn apply_display_mode(
    app: &AppHandle,
    mode: DisplayMode,
    monitor: Option<&MonitorInfo>,
    widget_position: Option<WidgetPosition>,
) -> Result<Option<WidgetPosition>, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or_else(|| "main window not found".to_string())?;

    match mode {
        DisplayMode::DeskCube => {
            let monitor = if let Some(monitor) = monitor {
                Some(monitor.clone())
            } else {
                list_monitors(app)
                    .ok()
                    .and_then(|monitors| monitors.into_iter().find(|m| m.is_primary))
            };
            let monitor = monitor.ok_or_else(|| "no monitor available".to_string())?;
            window
                .set_fullscreen(false)
                .map_err(|error| error.to_string())?;
            window
                .set_decorations(false)
                .map_err(|error| error.to_string())?;
            window
                .set_resizable(false)
                .map_err(|error| error.to_string())?;
            window
                .set_always_on_top(false)
                .map_err(|error| error.to_string())?;
            window
                .set_position(Position::Physical(PhysicalPosition {
                    x: monitor.x,
                    y: monitor.y,
                }))
                .map_err(|error| error.to_string())?;
            window
                .set_size(Size::Physical(PhysicalSize {
                    width: monitor.width,
                    height: monitor.height,
                }))
                .map_err(|error| error.to_string())?;
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            Ok(None)
        }
        DisplayMode::Widget => {
            let position = widget_position.unwrap_or(WidgetPosition { x: 64, y: 64 });
            window
                .set_fullscreen(false)
                .map_err(|error| error.to_string())?;
            window
                .set_decorations(false)
                .map_err(|error| error.to_string())?;
            window
                .set_resizable(false)
                .map_err(|error| error.to_string())?;
            window
                .set_always_on_top(true)
                .map_err(|error| error.to_string())?;
            window
                .set_size(Size::Physical(PhysicalSize {
                    width: WIDGET_SIZE,
                    height: WIDGET_SIZE,
                }))
                .map_err(|error| error.to_string())?;
            window
                .set_position(Position::Physical(PhysicalPosition {
                    x: position.x,
                    y: position.y,
                }))
                .map_err(|error| error.to_string())?;
            window.show().map_err(|error| error.to_string())?;
            window.set_focus().map_err(|error| error.to_string())?;
            Ok(Some(position))
        }
    }
}
