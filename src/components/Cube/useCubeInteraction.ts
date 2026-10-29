import { useEffect, useRef, type RefObject } from 'react'

const SWIPE_THRESHOLD_PX = 36
const INPUT_LOCK_MS = 300
const LONG_PRESS_MS = 550
/** 8% edge inset — ignore presses near viewport chrome */
const EDGE_INSET = 0.08

export type FlipHandler = (direction: 1 | -1, axis: 'x' | 'y') => void

type Options = {
  onFlip: FlipHandler
  /** Short tap (no movement) — pause/resume */
  onTap?: () => void
  /** Long-press — reset to full face duration (Idle) */
  onLongPress?: () => void
  isBusy: () => boolean
  lockAfterFlipMs?: number
}

export function useCubeInteraction(
  targetRef: RefObject<HTMLElement | null>,
  { onFlip, onTap, onLongPress, isBusy, lockAfterFlipMs = INPUT_LOCK_MS }: Options,
) {
  const onFlipRef = useRef(onFlip)
  const onTapRef = useRef(onTap)
  const onLongPressRef = useRef(onLongPress)
  const isBusyRef = useRef(isBusy)
  const gestureLockUntil = useRef(0)

  useEffect(() => {
    onFlipRef.current = onFlip
  }, [onFlip])
  useEffect(() => {
    onTapRef.current = onTap
  }, [onTap])
  useEffect(() => {
    onLongPressRef.current = onLongPress
  }, [onLongPress])
  useEffect(() => {
    isBusyRef.current = isBusy
  }, [isBusy])

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    let pointerId: number | null = null
    let startX = 0
    let startY = 0
    let moved = false
    let longFired = false
    let longTimer: number | null = null

    const blocked = () =>
      isBusyRef.current() || performance.now() < gestureLockUntil.current

    const armLock = () => {
      gestureLockUntil.current = performance.now() + lockAfterFlipMs
    }

    const clearLong = () => {
      if (longTimer !== null) {
        window.clearTimeout(longTimer)
        longTimer = null
      }
    }

    const inEdgeInset = (x: number, y: number) => {
      const w = window.innerWidth
      const h = window.innerHeight
      const ix = w * EDGE_INSET
      const iy = h * EDGE_INSET
      return x < ix || x > w - ix || y < iy || y > h - iy
    }

    const onPointerDown = (e: PointerEvent) => {
      if (blocked()) return
      if (pointerId !== null) return
      if (inEdgeInset(e.clientX, e.clientY)) return
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      moved = false
      longFired = false
      el.setPointerCapture(e.pointerId)
      clearLong()
      longTimer = window.setTimeout(() => {
        if (pointerId === null || moved) return
        longFired = true
        onLongPressRef.current?.()
        armLock()
      }, LONG_PRESS_MS)
    }

    const onPointerMove = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
        moved = true
        clearLong()
      }
    }

    const finish = (e: PointerEvent) => {
      if (pointerId !== e.pointerId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      pointerId = null
      clearLong()
      if (longFired) return
      if (blocked()) return

      if (moved && Math.hypot(dx, dy) >= SWIPE_THRESHOLD_PX) {
        if (Math.abs(dx) >= Math.abs(dy)) {
          onFlipRef.current(dx < 0 ? 1 : -1, 'y')
        } else {
          onFlipRef.current(dy < 0 ? 1 : -1, 'x')
        }
        armLock()
        return
      }

      if (!moved) {
        if (onTapRef.current) {
          onTapRef.current()
        } else {
          onFlipRef.current(1, 'y')
        }
        armLock()
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (blocked()) return
      onFlipRef.current(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1, 'y')
      armLock()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'd' || e.key === 'D' || e.key === 'p' || e.key === 'P') return
      if (blocked()) return
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onFlipRef.current(-1, 'y')
        armLock()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onFlipRef.current(1, 'y')
        armLock()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        onFlipRef.current(-1, 'x')
        armLock()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        onFlipRef.current(1, 'x')
        armLock()
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault()
        onTapRef.current?.()
        armLock()
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', finish)
    el.addEventListener('pointercancel', finish)
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKeyDown)

    return () => {
      clearLong()
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', finish)
      el.removeEventListener('pointercancel', finish)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [targetRef, lockAfterFlipMs])
}
