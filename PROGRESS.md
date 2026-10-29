# Progress — flip-cube-timer (منظم الوقت)

## Status
- **Current:** native `tauri:dev` running; **quality polish pass** (cube crease/lighting, looping two-tone alarm + fade-in, finish hint/dismiss). M6 installer still separate.
- **Date:** 2026-10-29

## Commits
| Hash | Message |
|------|---------|
| eb322a3 | M0: CSS 3D flip cube… |
| 9cab6ae | M0: visual pass complete |
| f73f55e | M1: Rust timer engine + storage/monitor + UI wiring |
| *(pending)* | M2-M4: desktop modes, tray, wake, hotkeys stubs |

## Gates (latest)
- `cargo test --no-default-features --lib` → **22 passed**
- `cargo check --features app` → **passed** (source check; no linked Tauri binary)
- `cargo clippy --no-default-features --lib -- -D warnings` → clean
- `npm.cmd run build` → OK
- Playwright e2e (`tests/e2e`) → smoke specs present; not rerun in this pass
- `tauri build` → **blocked** (no `link.exe` / VC Tools)

## Decisions (locked)
- Tauri 2 + React + TS + Vite + Zustand
- Arabic productName منظم الوقت; ASCII folder
- Timer Rust, timestamp `end_at` / `wall_now`, UI events only
- Settings overlay (single WebView)
- Atomic JSON + `.bak` + defaults on corrupt
- Desk: borderless monitor bounds; Widget ~220² AoT
- Angled: yaw −22, pitch −19, perspectiveFactor 4.2

## Clock strategy
`WallClock::wall_now` = UNIX ms for persisted deadlines. Remaining = clamp(end − now, 0..duration). Injectable `Clock` for unit tests (sleep, jumps, restore).

## Tooling
- GNU tests: `E:\toolchains\mingw64` (space-free copy; WinGet path under `Nour Soft` breaks ld)
- BuildTools 2022 installed **without** VC C++ workload → quiet/bootstrapper installs exit without MSVC
- **ACTION NEEDED:** elevate and run:
  ```
  & "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\setup.exe" modify `
    --installPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" `
    --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive
  ```
  Then: `npm run tauri build`

## Milestone checklist
| ID | Status |
|----|--------|
| M0 visual | done |
| M1 engine + wire | done (lib tests; tauri app feature coded) |
| M2 UI/settings/i18n | largely done (settings overlay, themes, RTL, LED HH/MM) |
| M3 desk/widget + monitor match | coded (matcher tested; live Spacedesk migration needs MSVC app) |
| M4 tray/wake/hotkeys/single-instance | coded (tray, wake, single-instance; hotkeys exposed as command stubs) |
| M5 persistence/autostart | persistence done; autostart flag in settings (OS register pending full app) |
| M6 package/docs | logging/icons/NSIS config done; installer pending MSVC |

## Known gaps until MSVC
- Cannot produce NSIS or run installed-app smoke
- Portable target is not configured; current Tauri config uses NSIS plus WebView2 `downloadBootstrapper`
- Global OS shortcut registration is not enabled yet; backend handlers exist for Ctrl+Alt+Right/Space/R/D defaults
- Spacedesk disable/enable real test needs running desktop app + optional admin for display adapters
- 30‑min soak / RAM tree measurement pending release binary
