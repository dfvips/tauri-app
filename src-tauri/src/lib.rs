use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "macos")]
use std::sync::OnceLock;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSWindow, NSWindowAnimationBehavior};
#[cfg(target_os = "macos")]
use objc2_foundation::NSPoint;
#[cfg(target_os = "macos")]
use tauri::menu::{Menu, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use tauri::{LogicalSize, Manager, RunEvent, Size, WebviewWindowBuilder, WindowEvent};
use tauri::webview::PageLoadEvent;

#[cfg(target_os = "macos")]
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
#[cfg(target_os = "macos")]
static SUPPRESS_EXIT: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
fn exit_fullscreen_no_anim(window: &tauri::Window) {
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            let prev = ns_window.animationBehavior();
            ns_window.setAnimationBehavior(NSWindowAnimationBehavior::None);
            ns_window.toggleFullScreen(None);
            ns_window.setAnimationBehavior(prev);
        }
    } else {
        let _ = window.set_fullscreen(false);
    }
}

#[cfg(target_os = "macos")]
fn set_window_alpha(window: &tauri::Window, alpha: f64) {
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            ns_window.setAlphaValue(alpha as _);
        }
    }
}

#[cfg(target_os = "macos")]
fn set_webview_alpha(window: &tauri::WebviewWindow, alpha: f64) {
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            ns_window.setAlphaValue(alpha as _);
        }
    }
}

#[cfg(target_os = "macos")]
fn order_out(window: &tauri::Window) {
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            ns_window.orderOut(None);
        }
    }
}

#[cfg(target_os = "macos")]
fn move_offscreen(window: &tauri::Window) {
    if let Ok(ptr) = window.ns_window() {
        unsafe {
            let ns_window: &NSWindow = &*(ptr as *mut NSWindow);
            ns_window.setFrameOrigin(NSPoint::new(100000.0, 100000.0));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _ = APP_HANDLE.set(app.handle().clone());
            }
            Ok(())
        })
        .on_page_load(move |webview, payload| {
            if payload.event() == PageLoadEvent::Finished {
                let scheme = payload.url().scheme();
                if scheme == "http" || scheme == "https" {
                    let window = webview.window();
                    match window.is_visible() {
                        Ok(false) => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        Err(_) => {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        _ => {}
                    }
                }
            }
        });

    #[cfg(target_os = "macos")]
    {
        let builder = builder
            .on_window_event(|window, event| {
                if window.label() != "main" {
                    return;
                }

                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    if let Some(app) = APP_HANDLE.get() {
                        SUPPRESS_EXIT.store(true, Ordering::SeqCst);
                        let was_fullscreen = window.is_fullscreen().unwrap_or(false);

                        let window_hide = window.clone();
                        let _ = app.run_on_main_thread(move || {
                            let _ = window_hide.hide();
                            if was_fullscreen {
                                set_window_alpha(&window_hide, 0.0);
                                order_out(&window_hide);
                                exit_fullscreen_no_anim(&window_hide);
                                order_out(&window_hide);
                                move_offscreen(&window_hide);
                                let _ = window_hide.hide();
                            }
                        });

                        return;
                    }
                    let window_hide = window.clone();
                    let _ = window.run_on_main_thread(move || {
                        let _ = window_hide.hide();
                    });
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
            match event {
                RunEvent::ExitRequested { api, .. } => {
                    if SUPPRESS_EXIT.swap(false, Ordering::SeqCst) {
                        api.prevent_exit();
                    }
                }
                RunEvent::Reopen { .. } => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        set_webview_alpha(&window, 1.0);
                        if let Some(cfg) = app_handle.config().app.windows.get(0) {
                            let width = cfg.width;
                            let height = cfg.height;
                            if width > 0.0 && height > 0.0 {
                                let _ = window.set_size(Size::Logical(LogicalSize {
                                    width,
                                    height,
                                }));
                            }
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                    } else if let Some(cfg) = app_handle.config().app.windows.get(0) {
                        let mut cfg = cfg.clone();
                        cfg.visible = false;
                        cfg.label = "main".to_string();
                        let _ = WebviewWindowBuilder::from_config(app_handle, &cfg)
                            .and_then(|builder| builder.build());
                    }
                }
                _ => {}
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
