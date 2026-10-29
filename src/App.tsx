import { useCallback, useEffect, useRef, useState } from 'react'
import { Cube, type CubeTheme } from './components/Cube/Cube'
import { type AppSettings, useTimerStore } from './lib/timerStore'
import {
  applyPreset,
  clamp,
  loadView,
  saveView,
  type ViewAngles,
  type ViewMode,
} from './lib/viewSettings'
import { isAlarmPlaying, playAlarm, stopAlarm } from './lib/alarm'

const HINT_KEY = 'flip-cube-hint-seen'

export default function App() {
  const timer = useTimerStore((state) => state.timer)
  const settings = useTimerStore((state) => state.settings)
  const initTimer = useTimerStore((state) => state.init)
  const flipSettle = useTimerStore((state) => state.flipSettle)
  const tapTimer = useTimerStore((state) => state.tap)
  const resetTimer = useTimerStore((state) => state.reset)
  const saveSettings = useTimerStore((state) => state.saveSettings)
  const [theme, setTheme] = useState<CubeTheme>('white')
  const [perfMode, setPerfMode] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [fps, setFps] = useState(0)
  const [lastFlipMaxMs, setLastFlipMaxMs] = useState(0)
  const [lastFlipFrames, setLastFlipFrames] = useState(0)
  const [edgePx, setEdgePx] = useState(0)
  const [view, setView] = useState<ViewAngles>(() =>
    typeof window !== 'undefined' ? loadView() : applyPreset('angled'),
  )
  const touchTimer = useRef<number | null>(null)
  const [touchChrome, setTouchChrome] = useState(false)

  useEffect(() => {
    void initTimer()
  }, [initTimer])

  useEffect(() => {
    setTheme(settings.theme)
    setPerfMode(settings.perf_mode)
    setView((cur) => ({
      ...cur,
      mode: settings.view_mode,
      yaw: settings.yaw,
      pitch: settings.pitch,
      perspectiveFactor: settings.perspective_factor,
    }))
  }, [settings])

  useEffect(() => {
    saveView(view)
  }, [view])

  useEffect(() => {
    const seen = sessionStorage.getItem(HINT_KEY)
    if (!seen) {
      setHintVisible(true)
      const t = window.setTimeout(() => {
        setHintVisible(false)
        sessionStorage.setItem(HINT_KEY, '1')
      }, 4000)
      return () => window.clearTimeout(t)
    }
  }, [])

  useEffect(() => {
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = (now: number) => {
      frames += 1
      if (now - last >= 500 && !window.__flipCube?.isFlipping()) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const setMode = useCallback((mode: ViewMode) => {
    setView(applyPreset(mode))
  }, [])

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => {
      void saveSettings({ ...settings, ...patch })
    },
    [saveSettings, settings],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D') {
        setDebugOpen((v) => !v)
        return
      }
      if (e.key === 'p' || e.key === 'P') {
        setPerfMode((v) => {
          const next = !v
          window.__flipCube?.setPerfMode(next)
          return next
        })
        return
      }
      if (e.key === 'v' || e.key === 'V') {
        setView((cur) => applyPreset(cur.mode === 'angled' ? 'flat' : 'angled'))
        return
      }

      if (!debugOpen) return

      const stepYaw = e.shiftKey ? 2 : 1
      const stepPitch = e.shiftKey ? 2 : 1
      const stepFactor = e.shiftKey ? 0.25 : 0.1
      const stepNudge = e.shiftKey ? 0.02 : 0.01

      setView((cur) => {
        let next = { ...cur }
        switch (e.key) {
          case 'q':
          case 'Q':
          case '[':
            next = { ...cur, yaw: round1(cur.yaw - stepYaw) }
            break
          case 'e':
          case 'E':
          case ']':
            next = { ...cur, yaw: round1(cur.yaw + stepYaw) }
            break
          case 'r':
          case 'R':
          case ';':
            next = { ...cur, pitch: round1(cur.pitch - stepPitch) }
            break
          case 'f':
          case 'F':
          case "'":
            next = { ...cur, pitch: round1(cur.pitch + stepPitch) }
            break
          case 'z':
          case 'Z':
            next = {
              ...cur,
              perspectiveFactor: round2(
                clamp(cur.perspectiveFactor - stepFactor, 3, 5),
              ),
            }
            break
          case 'c':
          case 'C':
            next = {
              ...cur,
              perspectiveFactor: round2(
                clamp(cur.perspectiveFactor + stepFactor, 3, 5),
              ),
            }
            break
          case 't':
          case 'T':
            next = { ...cur, nudgeX: round3(cur.nudgeX - stepNudge) }
            break
          case 'g':
          case 'G':
            next = { ...cur, nudgeX: round3(cur.nudgeX + stepNudge) }
            break
          case 'y':
          case 'Y':
            next = { ...cur, nudgeY: round3(cur.nudgeY - stepNudge) }
            break
          case 'h':
          case 'H':
            next = { ...cur, nudgeY: round3(cur.nudgeY + stepNudge) }
            break
          case '0':
            next = applyPreset(cur.mode)
            break
          default:
            return cur
        }
        e.preventDefault()
        return next
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [debugOpen])

  const showTouchChrome = useCallback(() => {
    setTouchChrome(true)
    if (touchTimer.current) window.clearTimeout(touchTimer.current)
    touchTimer.current = window.setTimeout(() => setTouchChrome(false), 2500)
  }, [])

  const onFlipStats = useCallback(
    (stats: { maxFrameMs: number; frameCount: number }) => {
      setLastFlipMaxMs(Math.round(stats.maxFrameMs * 10) / 10)
      setLastFlipFrames(stats.frameCount)
    },
    [],
  )

  const perspPx = Math.round(edgePx * view.perspectiveFactor)

  const debugText = [
    `FPS ${fps}`,
    `Last flip max ${lastFlipMaxMs}ms`,
    `Frames ${lastFlipFrames}`,
    `Perf ${perfMode ? 'ON' : 'OFF'} (P)`,
    `View ${view.mode} (V)`,
    `yaw ${view.yaw}°  [Q/E]`,
    `pitch ${view.pitch}°  [R/F]`,
    `perspFactor ${view.perspectiveFactor}× (~${perspPx}px)  [Z/C]`,
    `edge ${Math.round(edgePx)}px (auto-fit)`,
    `nudgeX ${view.nudgeX}  [T/G]`,
    `nudgeY ${view.nudgeY}  [Y/H]`,
    `reset preset (0)  Debug (D)`,
  ].join('\n')

  return (
    <div className="desk-stage" onPointerDown={showTouchChrome}>
      <div className="chrome-stack">
        <button
          type="button"
          className={`view-toggle${touchChrome ? ' is-touch-visible' : ''}`}
          onClick={() => {
            const next = view.mode === 'angled' ? 'flat' : 'angled'
            setMode(next)
            updateSettings({ view_mode: next })
          }}
          aria-label="Toggle view angle"
        >
          {view.mode === 'angled' ? 'Flat' : 'Angled'}
        </button>
        <button
          type="button"
          className={`theme-toggle${touchChrome ? ' is-touch-visible' : ''}`}
          onClick={() => {
            const next = theme === 'white' ? 'black' : 'white'
            setTheme(next)
            updateSettings({ theme: next })
          }}
          aria-label="Toggle cube theme"
        >
          {theme === 'white' ? 'Black' : 'White'}
        </button>
        <button
          type="button"
          className={`settings-toggle${touchChrome ? ' is-touch-visible' : ''}`}
          onClick={() => setSettingsOpen((open) => !open)}
          aria-label="Open settings"
        >
          Settings
        </button>
      </div>

      <div
        className="debug-overlay"
        hidden={!debugOpen}
        data-testid="debug-overlay"
      >
        {debugText}
      </div>

      <Cube
        theme={theme}
        facesMin={settings.face_minutes}
        perfMode={perfMode}
        view={view}
        timer={timer}
        onFlipSettled={(face) => void flipSettle(face)}
        onTap={() => void tapTimer()}
        onReset={() => void resetTimer()}
        onFlipStats={onFlipStats}
        onFitChange={setEdgePx}
      />

      <SettingsOverlay
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onChange={updateSettings}
      />

      <p
        className={`desk-hint${hintVisible || timer.state === 'Finished' ? ' is-visible' : ''}${timer.state === 'Finished' ? ' is-urgent' : ''}`}
      >
        {timer.state === 'Finished'
          ? settings.language === 'ar'
            ? 'اضغط لإيقاف التنبيه'
            : 'Tap to stop the alarm'
          : 'اسحب / انقر للقلب · Swipe or click to flip · ← → · Wheel'}
      </p>
    </div>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function SettingsOverlay({
  open,
  settings,
  onClose,
  onChange,
}: {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onChange: (patch: Partial<AppSettings>) => void
}) {
  const [testingAlarm, setTestingAlarm] = useState(false)

  useEffect(() => {
    if (!open && testingAlarm) {
      stopAlarm()
      setTestingAlarm(false)
    }
  }, [open, testingAlarm])

  if (!open) return null

  const rtl = settings.language === 'ar'
  const text = rtl
    ? {
        title: 'إعدادات منظم الوقت',
        close: 'إغلاق',
        theme: 'المظهر',
        language: 'اللغة',
        sound: 'الصوت',
        perf: 'أداء أعلى',
        autostart: 'تشغيل تلقائي',
        faces: 'الدقائق',
      }
    : {
        title: 'Timer Settings',
        close: 'Close',
        theme: 'Theme',
        language: 'Language',
        sound: 'Sound',
        perf: 'Performance mode',
        autostart: 'Autostart',
        faces: 'Face minutes',
      }

  return (
    <div className="settings-panel" dir={rtl ? 'rtl' : 'ltr'}>
      <div className="settings-card">
        <div className="settings-card__head">
          <h2>{text.title}</h2>
          <button type="button" onClick={onClose}>
            {text.close}
          </button>
        </div>
        <label>
          {text.theme}
          <select
            value={settings.theme}
            onChange={(e) => onChange({ theme: e.currentTarget.value as CubeTheme })}
          >
            <option value="white">White</option>
            <option value="black">Black</option>
          </select>
        </label>
        <label>
          {text.language}
          <select
            value={settings.language}
            onChange={(e) =>
              onChange({ language: e.currentTarget.value as AppSettings['language'] })
            }
          >
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </label>
        <div className="settings-grid">
          {settings.face_minutes.map((minutes, index) => (
            <label key={index}>
              {text.faces} {index + 1}
              <input
                type="number"
                min={1}
                max={180}
                value={minutes}
                onChange={(e) => {
                  const faceMinutes = [...settings.face_minutes] as AppSettings['face_minutes']
                  faceMinutes[index] = clamp(Number(e.currentTarget.value), 1, 180)
                  onChange({ face_minutes: faceMinutes })
                }}
              />
            </label>
          ))}
        </div>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.sound_enabled}
            onChange={(e) => onChange({ sound_enabled: e.currentTarget.checked })}
          />
          {text.sound}
        </label>
        <button
          type="button"
          className="settings-test-sound"
          onClick={() => {
            if (testingAlarm || isAlarmPlaying()) {
              stopAlarm()
              setTestingAlarm(false)
              return
            }
            setTestingAlarm(true)
            void playAlarm({
              enabled: true,
              volume: 0.9,
              src: settings.sound_path ?? '/sounds/alarm.wav',
            })
          }}
        >
          {testingAlarm
            ? rtl
              ? 'إيقاف التنبيه'
              : 'Stop alarm'
            : rtl
              ? 'تجربة التنبيه'
              : 'Test alarm'}
        </button>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.perf_mode}
            onChange={(e) => onChange({ perf_mode: e.currentTarget.checked })}
          />
          {text.perf}
        </label>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={settings.autostart}
            onChange={(e) => onChange({ autostart: e.currentTarget.checked })}
          />
          {text.autostart}
        </label>
      </div>
    </div>
  )
}
