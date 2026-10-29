import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { useSilhouetteFit } from '../../hooks/useSilhouetteFit'
import {
  DEFAULT_FACES_MIN,
  faceLabel,
  formatMmSs,
  type FaceIndex,
} from '../../lib/faces'
import type { ViewAngles } from '../../lib/viewSettings'
import { useCubeInteraction } from './useCubeInteraction'

export type CubeTheme = 'white' | 'black'

const FACE_COUNT = 6
const QUALITY_FLIP_MS = 520
const PERF_FLIP_MS = 480

export type FlipCubeApi = {
  flip: (direction?: 1 | -1, axis?: 'x' | 'y') => boolean
  isFlipping: () => boolean
  getActiveFace: () => number
  setPerfMode: (on: boolean) => void
  getPerfMode: () => boolean
  getLastFlipStats: () => { maxFrameMs: number; frameCount: number } | null
}

declare global {
  interface Window {
    __flipCube?: FlipCubeApi
  }
}

type CubeProps = {
  theme: CubeTheme
  facesMin?: readonly number[]
  perfMode: boolean
  view: ViewAngles
  onFlipStats?: (stats: { maxFrameMs: number; frameCount: number }) => void
  onFitChange?: (edgePx: number) => void
}

function faceMinutes(
  facesMin: readonly number[],
  active: FaceIndex,
  offset: number,
): number {
  return facesMin[(active + offset + FACE_COUNT) % FACE_COUNT]!
}

const SEG_MAP: Record<string, string[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
}

function segmentsFor(ch: string): Set<string> {
  return new Set(SEG_MAP[ch] ?? [])
}

function xf(
  yaw: number,
  pitch: number,
  nudgeXPx: number,
  nudgeYPx: number,
  dYaw = 0,
  dPitch = 0,
): string {
  return `translate3d(${nudgeXPx}px, ${nudgeYPx}px, 0) rotateX(${pitch + dPitch}deg) rotateY(${yaw + dYaw}deg)`
}

export function Cube({
  theme,
  facesMin = DEFAULT_FACES_MIN,
  perfMode,
  view,
  onFlipStats,
  onFitChange,
}: CubeProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const cubeRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const settledGen = useRef(0)
  const activeFaceRef = useRef<FaceIndex>(0)
  const perfModeRef = useRef(perfMode)
  const viewRef = useRef(view)
  const animRef = useRef<Animation | null>(null)
  const onFlipStatsRef = useRef(onFlipStats)
  const lastStatsRef = useRef<{ maxFrameMs: number; frameCount: number } | null>(
    null,
  )
  const flipSeqRef = useRef(0)

  const [activeFace, setActiveFace] = useState<FaceIndex>(0)
  const [running, setRunning] = useState(true)

  const topRef = useRef<HTMLSpanElement>(null)
  const rightRef = useRef<HTMLSpanElement>(null)
  const leftRef = useRef<HTMLSpanElement>(null)
  const bottomRef = useRef<HTMLSpanElement>(null)
  const backRef = useRef<HTMLSpanElement>(null)
  const ledRootRef = useRef<HTMLDivElement>(null)
  const ledRef = useRef<HTMLSpanElement>(null)

  const fit = useSilhouetteFit(
    '.desk-stage',
    sceneRef,
    cubeRef,
    view,
    [theme],
  )
  const fitRef = useRef(fit)
  fitRef.current = fit

  useEffect(() => {
    onFitChange?.(fit.edgePx)
  }, [fit.edgePx, onFitChange])

  useEffect(() => {
    perfModeRef.current = perfMode
    sceneRef.current?.classList.toggle('is-perf', perfMode)
  }, [perfMode])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    onFlipStatsRef.current = onFlipStats
  }, [onFlipStats])

  const paintFaces = useCallback(
    (face: FaceIndex) => {
      const setNum = (el: HTMLSpanElement | null, offset: number) => {
        if (el) el.textContent = faceLabel(faceMinutes(facesMin, face, offset))
      }
      setNum(topRef.current, 0)
      setNum(rightRef.current, 1)
      setNum(leftRef.current, FACE_COUNT - 1)
      setNum(bottomRef.current, 2)
      setNum(backRef.current, 3)

      const { mm, ss } = formatMmSs(facesMin[face]! * 60)
      const root = ledRootRef.current
      if (!root) return
      const digits = root.querySelectorAll('.led-digit')
      ;[mm[0], mm[1], ss[0], ss[1]].forEach((ch, i) => {
        const digit = digits[i]
        if (!digit || !ch) return
        const on = segmentsFor(ch)
        digit.querySelectorAll('.led-digit__seg').forEach((seg) => {
          const name = [...seg.classList]
            .find((c) => c.startsWith('led-digit__seg--'))
            ?.replace('led-digit__seg--', '')
          seg.classList.toggle('is-on', Boolean(name && on.has(name)))
        })
      })
    },
    [facesMin],
  )

  useLayoutEffect(() => {
    paintFaces(activeFace)
  }, [activeFace, paintFaces, theme])

  const measureFlipFrames = useCallback((durationMs: number) => {
    const frames: number[] = []
    let last = performance.now()
    let raf = 0
    const start = last
    let stopped = false
    let finalized = false

    const finalize = () => {
      if (finalized) return
      finalized = true
      const maxFrameMs = frames.reduce((a, b) => Math.max(a, b), 0)
      const stats = { maxFrameMs, frameCount: frames.length }
      lastStatsRef.current = stats
      onFlipStatsRef.current?.(stats)
    }

    const tick = (now: number) => {
      if (stopped) return
      frames.push(now - last)
      last = now
      if (now - start < durationMs + 32) {
        raf = requestAnimationFrame(tick)
      } else {
        finalize()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      finalize()
    }
  }, [])

  const flip = useCallback(
    (direction: 1 | -1 = 1, axis: 'x' | 'y' = 'y') => {
      const cube = cubeRef.current
      const scene = sceneRef.current
      if (!cube || !scene || busyRef.current) return false

      busyRef.current = true
      const gen = ++settledGen.current
      const flipIndex = flipSeqRef.current++
      const v = viewRef.current
      const f = fitRef.current
      const usePerf = perfModeRef.current
      const duration = usePerf ? PERF_FLIP_MS : QUALITY_FLIP_MS

      const nudgeXPx = v.nudgeX * f.edgePx + f.fitOffsetX
      const nudgeYPx = v.nudgeY * f.edgePx + f.fitOffsetY
      const rest = xf(v.yaw, v.pitch, nudgeXPx, nudgeYPx)
      const dYaw = axis === 'y' ? direction * -90 : 0
      const dPitch = axis === 'x' ? direction * -90 : 0
      const end = xf(v.yaw, v.pitch, nudgeXPx, nudgeYPx, dYaw, dPitch)

      scene.classList.add('is-motion')
      ledRef.current?.classList.remove('is-on')
      scene.querySelector('.led-gap')?.classList.remove('is-blink')

      animRef.current?.cancel()

      const stopMeasure = measureFlipFrames(duration)
      let markedEnd = false
      const markEnd = () => {
        if (markedEnd) return
        markedEnd = true
        performance.mark(`flip-end-${flipIndex}`)
      }

      const settleDom = () => {
        if (gen !== settledGen.current) return

        animRef.current?.cancel()
        animRef.current = null
        cube.style.transform = ''
        cube.style.willChange = ''

        const next = ((activeFaceRef.current + direction + FACE_COUNT) %
          FACE_COUNT) as FaceIndex
        activeFaceRef.current = next
        paintFaces(next)

        scene.classList.remove('is-motion')
        ledRef.current?.classList.add('is-on')
        scene.querySelector('.led-gap')?.classList.add('is-blink')

        setActiveFace(next)
        setRunning(true)
      }

      const finish = () => {
        if (gen !== settledGen.current) return
        if (!busyRef.current) return
        markEnd()
        busyRef.current = false
        stopMeasure()
        requestAnimationFrame(() => settleDom())
      }

      let keyframes: Keyframe[]
      if (usePerf) {
        const steps = 8
        keyframes = Array.from({ length: steps + 1 }, (_, i) => {
          const t = i / steps
          return {
            transform: xf(
              v.yaw,
              v.pitch,
              nudgeXPx,
              nudgeYPx,
              dYaw * t,
              dPitch * t,
            ),
            offset: t,
          }
        })
      } else {
        keyframes = [{ transform: rest }, { transform: end }]
      }

      cube.style.willChange = 'transform'
      const anim = cube.animate(keyframes, {
        duration,
        easing: usePerf ? 'steps(8, end)' : 'cubic-bezier(0.22, 1.05, 0.28, 1)',
        fill: 'forwards',
        composite: 'replace',
      })
      animRef.current = anim
      anim.pause()
      anim.currentTime = 0

      requestAnimationFrame(() => {
        if (gen !== settledGen.current) return
        anim.play()
        requestAnimationFrame(() => {
          if (gen !== settledGen.current) return
          performance.mark(`flip-start-${flipIndex}`)
        })
      })

      anim.onfinish = () => finish()
      window.setTimeout(finish, duration + 120)

      return true
    },
    [measureFlipFrames, paintFaces],
  )

  useCubeInteraction(sceneRef, {
    onFlip: flip,
    isBusy: () => busyRef.current,
  })

  useEffect(() => {
    const api: FlipCubeApi = {
      flip: (d = 1, a = 'y') => flip(d, a),
      isFlipping: () => busyRef.current,
      getActiveFace: () => activeFaceRef.current,
      setPerfMode: (on) => {
        perfModeRef.current = on
        sceneRef.current?.classList.toggle('is-perf', on)
      },
      getPerfMode: () => perfModeRef.current,
      getLastFlipStats: () => lastStatsRef.current,
    }
    window.__flipCube = api
    return () => {
      if (window.__flipCube === api) delete window.__flipCube
    }
  }, [flip])

  const { mm, ss } = formatMmSs(facesMin[activeFace]! * 60)

  return (
    <div
      ref={sceneRef}
      className={`cube-scene${perfMode ? ' is-perf' : ''}`}
      role="application"
      aria-label="Flip cube timer"
      data-testid="cube-scene"
    >
      <div className="cube-shadow" />
      <div ref={cubeRef} className="cube" data-theme={theme} data-testid="cube">
        <div className="cube-core" aria-hidden="true">
          <div className="cube-core-face cube-core-face--front" />
          <div className="cube-core-face cube-core-face--back" />
          <div className="cube-core-face cube-core-face--right" />
          <div className="cube-core-face cube-core-face--left" />
          <div className="cube-core-face cube-core-face--top" />
          <div className="cube-core-face cube-core-face--bottom" />
        </div>

        <div className="cube-face cube-face--front">
          <span
            ref={ledRef}
            className={`glass-led${running ? ' is-on' : ''}`}
            aria-hidden="true"
          />
          <div className="glass-bezel">
            <div ref={ledRootRef} className="led-row" aria-label={`${mm} ${ss}`}>
              <LedDigit char={mm[0] ?? '0'} />
              <LedDigit char={mm[1] ?? '0'} />
              <span
                className={`led-gap${running ? ' is-blink' : ''}`}
                aria-hidden="true"
              />
              <LedDigit char={ss[0] ?? '0'} />
              <LedDigit char={ss[1] ?? '0'} />
            </div>
          </div>
        </div>

        <div className="cube-face cube-face--back">
          <FaceNum valueRef={backRef} />
        </div>
        <div className="cube-face cube-face--right">
          <FaceNum valueRef={rightRef} />
        </div>
        <div className="cube-face cube-face--left">
          <FaceNum valueRef={leftRef} />
        </div>
        <div className="cube-face cube-face--top">
          <FaceNum valueRef={topRef} />
        </div>
        <div className="cube-face cube-face--bottom">
          <FaceNum valueRef={bottomRef} />
        </div>
      </div>
    </div>
  )
}

function FaceNum({ valueRef }: { valueRef: RefObject<HTMLSpanElement | null> }) {
  return (
    <div className="face-number">
      <span className="face-number__value" ref={valueRef}>
        00
      </span>
      <span className="face-number__unit">MIN</span>
    </div>
  )
}

function LedDigit({ char }: { char: string }) {
  const on = segmentsFor(char)
  return (
    <span className="led-digit" aria-hidden="true">
      {(['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const).map((seg) => (
        <span
          key={seg}
          className={`led-digit__seg led-digit__seg--${seg}${on.has(seg) ? ' is-on' : ''}`}
        />
      ))}
    </span>
  )
}
