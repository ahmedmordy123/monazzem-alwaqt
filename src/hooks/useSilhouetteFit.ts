import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { measureFaceSilhouette, viewportSize } from '../lib/fitCube'
import type { ViewAngles } from '../lib/viewSettings'

export type FitState = {
  edgePx: number
  fitOffsetX: number
  fitOffsetY: number
}

const INITIAL: FitState = { edgePx: 280, fitOffsetX: 0, fitOffsetY: 0 }

/**
 * Scale cube so the projected silhouette fills ~80% of the *viewport*,
 * then translate until the silhouette center is within 1% of the viewport center.
 */
export function useSilhouetteFit(
  stageSelector: string,
  sceneRef: RefObject<HTMLElement | null>,
  cubeRef: RefObject<HTMLElement | null>,
  view: ViewAngles,
  deps: unknown[] = [],
): FitState {
  const [fit, setFit] = useState<FitState>(INITIAL)
  const busy = useRef(false)

  useLayoutEffect(() => {
    const scene = sceneRef.current
    const cube = cubeRef.current
    const stage = scene?.closest(stageSelector) as HTMLElement | null
    if (!scene || !cube || !stage) return

    let cancelled = false

    const applyVars = (next: FitState) => {
      const edge = next.edgePx
      const persp = edge * view.perspectiveFactor
      scene.style.setProperty('--cube-size', `${edge}px`)
      scene.style.setProperty('--perspective', `${persp}px`)
      scene.style.setProperty('--yaw', `${view.yaw}deg`)
      scene.style.setProperty('--pitch', `${view.pitch}deg`)
      scene.style.setProperty(
        '--nudge-x',
        `${view.nudgeX * edge + next.fitOffsetX}px`,
      )
      scene.style.setProperty(
        '--nudge-y',
        `${view.nudgeY * edge + next.fitOffsetY}px`,
      )
    }

    const iterate = () => {
      if (cancelled || busy.current) return
      busy.current = true

      const { w: viewW, h: viewH } = viewportSize()
      if (viewW < 40 || viewH < 40) {
        busy.current = false
        return
      }

      const minEdge = 140
      const maxEdge = Math.min(viewW, viewH) * 0.92
      let edge = Math.min(
        Math.max(minEdge, Math.min(viewW, viewH) * 0.5),
        maxEdge,
      )

      // Scale passes (offset 0) against viewport
      for (let i = 0; i < 3; i++) {
        applyVars({ edgePx: edge, fitOffsetX: 0, fitOffsetY: 0 })
        void cube.offsetWidth
        const sil = measureFaceSilhouette(cube)
        if (!sil || sil.width < 8 || sil.height < 8) break
        const scale = Math.min(
          (viewW * 0.8) / sil.width,
          (viewH * 0.8) / sil.height,
        )
        edge = Math.min(maxEdge, Math.max(minEdge, edge * scale))
      }

      // Center silhouette on the viewport (not just the padded stage box)
      let fitOffsetX = 0
      let fitOffsetY = 0
      for (let i = 0; i < 4; i++) {
        applyVars({ edgePx: edge, fitOffsetX, fitOffsetY })
        void cube.offsetWidth
        const sil = measureFaceSilhouette(cube)
        if (!sil) break
        const errX = viewW / 2 - sil.centerX
        const errY = viewH / 2 - sil.centerY
        fitOffsetX += errX
        fitOffsetY += errY
        if (Math.abs(errX) <= viewW * 0.01 && Math.abs(errY) <= viewH * 0.01) {
          break
        }
      }

      const next = { edgePx: edge, fitOffsetX, fitOffsetY }
      applyVars(next)
      setFit(next)
      busy.current = false
    }

    const schedule = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!cancelled) iterate()
        })
      })
    }

    schedule()
    const ro = new ResizeObserver(() => schedule())
    ro.observe(stage)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.visualViewport?.addEventListener('resize', schedule)

    return () => {
      cancelled = true
      ro.disconnect()
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps passed explicitly
  }, [
    sceneRef,
    cubeRef,
    view.yaw,
    view.pitch,
    view.perspectiveFactor,
    view.nudgeX,
    view.nudgeY,
    stageSelector,
    ...deps,
  ])

  return fit
}
