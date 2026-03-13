use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
#[cfg(target_os = "macos")]
use std::time::Duration;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use tauri::{Manager, RunEvent, WindowEvent};
use tauri::webview::PageLoadEvent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shown = Arc::new(AtomicBool::new(false));
    let builder = tauri::Builder::default().on_page_load({
        let shown = shown.clone();
        move |webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let scheme = payload.url().scheme();
                if (scheme == "http" || scheme == "https")
                    && !shown.swap(true, Ordering::SeqCst)
                {
                    let _ = webview.window().show();
                }
            }
        }
    });

    #[cfg(target_os = "macos")]
    {
        let builder = builder
            .on_window_event(|window, event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    if window.label() == "main" {
                        api.prevent_close();
                        let window = window.clone();
                        std::thread::spawn(move || {
                            let was_fullscreen = window.is_fullscreen().unwrap_or(false);
                            if was_fullscreen {
                                let _ = window.set_fullscreen(false);
                                std::thread::sleep(Duration::from_millis(350));
                            }
                            let window_hide = window.clone();
                            let _ = window.run_on_main_thread(move || {
                                let _ = window_hide.hide();
                            });
                        });
                    }
                }
            })
            .menu(|app| {
            let app_name = app
                .config()
                .product_name
                .clone()
                .unwrap_or_else(|| app.package_info().name.clone());
            let about_label = format!("关于 {}", app_name);
            let quit_label = format!("退出 {}", app_name);
            let app_menu = Submenu::with_items(
                app,
                app_name,
                true,
                &[
                    &PredefinedMenuItem::about(app, Some(about_label.as_str()), None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, Some(quit_label.as_str()))?,
                ],
            )?;
            Menu::with_items(app, &[&app_menu])
        });

        let app = builder
            .build(tauri::generate_context!())
            .expect("error while running tauri application");

        app.run(|app_handle, event| {
            if let RunEvent::Reopen { .. } = event {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        });
        return;
    }

    #[cfg(not(target_os = "macos"))]
    {
        builder
            .run(tauri::generate_context!())
            .expect("error while running tauri application");
    }
}
