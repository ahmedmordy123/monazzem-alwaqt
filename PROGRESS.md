# Progress — flip-cube-timer (منظم الوقت)

## Status
- **Current:** M0 visual fix pass → commit, then M1+
- **Date:** 2026-10-29

## Decisions (locked)
- Tauri 2 + React + TS + Vite + Zustand
- Arabic product name in UI only; ASCII folder `flip-cube-timer`
- Timer in Rust, timestamp `end_at`, UI event-driven (no polling)
- Settings = in-window overlay (single WebView)
- Storage: atomic JSON + `.bak` + defaults on corrupt
- Desk Cube: borderless monitor bounds (not exclusive fullscreen)
- Angled defaults: yaw −22, pitch −19, perspectiveFactor 4.2
- Faces: 5 / 15 / 25 / 45 / 60 / custom(default 10, 1–180)

## M0 — visual fix pass
### Centering
- Fit uses viewport-absolute silhouette + iterative nudge to viewport center
- Measured 1629×973 + 6 random sizes in 1200×700–2200×1300: **ALL_PASS** (err ≤ 0.01%)

### Seams / notches
- Face overlap increased to ~11% each side + body-color `box-shadow` bleed
- Front/top Z proud; right recessed (−3.5px) to kill double edge / light seam
- Core `visibility: hidden` at rest; visible only during `.is-motion` flips
- Screenshots: `screenshots/1629x973-{white,black}-{rest,midflip}.png`

### Known visual notes
- Mid-flip may briefly show core by design (plugs wedges)
- Hint text hidden in QA screenshots via injected CSS

## Toolchain notes
- Rust 1.99.1 via rustup (C: space was tight; freed / auto-reinstalled)
- MSVC / WebView2 / Tauri scaffold: in progress for M1

## Milestones
| ID | Title | Status |
|----|-------|--------|
| M0 | CSS 3D cube + visual fix | nearly done → commit |
| M1 | Rust timer + Tauri wire | in progress |
| M2 | Full UI / settings / i18n | pending |
| M3 | Desk/Widget + monitors | pending |
| M4 | Tray / hotkeys / awake | pending |
| M5 | Persistence / autostart | pending |
| M6 | Polish / installer / docs | pending |
