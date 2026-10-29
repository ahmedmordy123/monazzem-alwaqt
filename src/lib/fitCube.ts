/** Projected-silhouette fit for the CSS 3D cube. */

export type Silhouette = {
  /** Viewport-absolute coordinates */
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

/** Axis-aligned bounds of all `.cube-face` elements in viewport space. */
export function measureFaceSilhouette(cubeEl: HTMLElement): Silhouette | null {
  const faces = cubeEl.querySelectorAll('.cube-face')
  if (faces.length === 0) return null

  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity

  faces.forEach((node) => {
    const r = (node as HTMLElement).getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return
    left = Math.min(left, r.left)
    top = Math.min(top, r.top)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  })

  if (!Number.isFinite(left)) return null

  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
    centerX: (left + right) / 2,
    centerY: (top + bottom) / 2,
  }
}

export function viewportSize(): { w: number; h: number } {
  const vv = window.visualViewport
  return {
    w: vv?.width ?? window.innerWidth,
    h: vv?.height ?? window.innerHeight,
  }
}
