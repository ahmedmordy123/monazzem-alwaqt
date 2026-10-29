import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { Cube, type CubeTheme } from './components/Cube/Cube'
import {
  applyPreset,
  loadView,
  saveView,
  viewToCssVars,
  type ViewAngles,
  type ViewMode,
} from './lib/viewSettings'

const HINT_KEY = 'flip-cube-hint-seen'

export default function App() {
  const [theme, setTheme] = useState<CubeTheme>('white')
  const [perfMode, setPerfMode] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [debugOpen, setDebugOpen] = useState(false)
  const [fps, setFps] = useState(0)
  const [lastFlipMaxMs, setLastFlipMaxMs] = useState(0)
  const [lastFlipFrames, setLastFlipFrames] = useState(0)
  const [view, setView] = useState<ViewAngles>(() =>
    typeof window !== 'undefined' ? loadView() : applyPreset('angled'),
  )
  const touchTimer = useRef<number | null>(null)
  const [touchChrome, setTouchChrome] = useState(false)

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
      // Avoid React commits during a flip (keeps the flip window free of layout work)
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
      const stepPersp = e.shiftKey ? 100 : 50
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
              perspective: clamp(
                cur.perspective - stepPersp,
                600,
                2400,
              ),
            }
            break
          case 'c':
          case 'C':
            next = {
              ...cur,
              perspective: clamp(
                cur.perspective + stepPersp,
                600,
                2400,
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

  const viewStyle = useMemo(
    () => viewToCssVars(view) as CSSProperties,
    [view],
  )

  const debugText = [
    `FPS ${fps}`,
    `Last flip max ${lastFlipMaxMs}ms`,
    `Frames ${lastFlipFrames}`,
    `Perf ${perfMode ? 'ON' : 'OFF'} (P)`,
    `View ${view.mode} (V)`,
    `yaw ${view.yaw}°  [Q/E]`,
    `pitch ${view.pitch}°  [R/F]`,
    `persp ${view.perspective}px  [Z/C]`,
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
          onClick={() =>
            setMode(view.mode === 'angled' ? 'flat' : 'angled')
          }
          aria-label="Toggle view angle"
        >
          {view.mode === 'angled' ? 'Flat' : 'Angled'}
        </button>
        <button
          type="button"
          className={`theme-toggle${touchChrome ? ' is-touch-visible' : ''}`}
          onClick={() => setTheme((t) => (t === 'white' ? 'black' : 'white'))}
          aria-label="Toggle cube theme"
        >
          {theme === 'white' ? 'Black' : 'White'}
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
        perfMode={perfMode}
        view={view}
        viewStyle={viewStyle}
        onFlipStats={onFlipStats}
      />

      <p className={`desk-hint${hintVisible ? ' is-visible' : ''}`}>
        اسحب / انقر للقلب · Swipe or click to flip · ← → · Wheel
      </p>
    </div>
  )
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
