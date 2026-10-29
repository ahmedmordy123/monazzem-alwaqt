# منظم الوقت / Flip Cube Timer

Software flip-cube timer for Windows (Tauri 2 + React). Flip the cube to pick a duration; countdown starts when the flip settles. Designed for a Spacedesk tablet display and a small desktop widget.

## Install

1. Run the NSIS installer from `src-tauri/target/release/bundle/nsis/` (after `npm run tauri build`).
2. WebView2: the installer can download the Evergreen bootstrapper if needed.
3. Portable: use the `.exe` under `bundle/nsis` / portable target when enabled.

## Usage

| Action | How |
|--------|-----|
| Flip / choose duration | Swipe any direction, click-drag, mouse wheel, ← → ↑ ↓ |
| Pause / resume | Tap / click (no move), Space |
| Reset to full face | Long-press (~550ms) |
| Settings | Settings button (top chrome) |
| Debug overlay | `D` |
| Performance flip | `P` |
| View angled/flat | `V` |

Faces (default minutes): 5, 15, 25, 45, 60, custom (10). Edit 1–180 in Settings. LED shows `MM SS`, or `HH MM` + HR when remaining ≥ 100 minutes.

## Hotkeys (defaults)

- `Ctrl+Alt+Right` — flip  
- `Ctrl+Alt+Space` — pause/resume  
- `Ctrl+Alt+R` — reset  
- `Ctrl+Alt+D` — desk ↔ widget  

## Spacedesk tips

- Identify the tablet by resolution/scale/position (not only OS id).
- If the virtual display disappears, the window moves to the primary monitor; when Spacedesk returns, it moves back.
- Prefer a stable tablet resolution/orientation while timing.

## Build from source

**Prerequisites:** Node 20+, Rust stable, **Visual Studio Build Tools with C++ workload** (`link.exe`), WebView2 runtime.

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;E:\toolchains\mingw64\bin;$env:Path"  # lib tests
cd E:\flip-cube-timer
npm install
cd src-tauri
cargo test --no-default-features --lib
cargo clippy --no-default-features --lib -- -D warnings
cd ..
npm run build
# Full app (requires MSVC):
npm run tauri dev
npm run tauri build
```

## Arabic / English

UI language is selectable in Settings. Layout is RTL for Arabic; numerals stay Western digits.

## License

Private / project use.
