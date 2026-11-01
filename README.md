# منظم الوقت / Flip Cube Timer

Open-source flip-cube timer for **Windows** and **Android**. Flip the cube (or lay the phone on a face) to pick a duration; the countdown starts when the face settles.

## Download / تحميل

| Platform | File | Link |
|----------|------|------|
| **Android APK** | `monazzem.apk` | [Download APK](https://github.com/ahmedmordy123/monazzem-alwaqt/releases/download/v0.2.0/monazzem.apk) |
| **Windows installer** | `flip-cube-timer-setup.exe` | [Download EXE](https://github.com/ahmedmordy123/monazzem-alwaqt/releases/download/v0.2.0/flip-cube-timer-setup.exe) |

All releases: https://github.com/ahmedmordy123/monazzem-alwaqt/releases

### Android
1. Allow install from unknown sources / “Install unknown apps” for your browser/Files.
2. Open the APK and install.
3. Lay the phone on a duration face to start; tap to pause; long-press to reset.

### Windows
1. Windows 10/11 64-bit.
2. Run the setup. If SmartScreen appears: **More info → Run anyway**.
3. WebView2 bootstrapper is embedded (needs internet once if missing).

## Features

- 3D flip cube (Windows CSS / Android Matrix4)
- Face durations (default): 5, 15, 25, 45, 60, 10 minutes (editable)
- Alarm on finish, Arabic/English UI, light/dark cube theme
- Android: accelerometer face detection + sensor screen orientation
- Windows: desk/widget modes, Spacedesk-friendly

## Source layout

```
src/            React + Vite UI (Windows)
src-tauri/      Tauri 2 + Rust timer engine
mobile/         Flutter Android app
installer/      Built APK / EXE (not in git; attached to Releases)
```

## Build from source

### Windows (Tauri)
**Prerequisites:** Node 20+, Rust stable, VS Build Tools (C++), WebView2.

```powershell
npm install
npm run tauri build
```

### Android (Flutter)
**Prerequisites:** Flutter stable, Android SDK.

```powershell
cd mobile
flutter pub get
flutter test
flutter build apk --release
# output: build/app/outputs/flutter-apk/app-release.apk
```

## License

MIT — free to use, share, and modify.
