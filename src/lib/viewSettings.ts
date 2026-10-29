export type ViewMode = 'angled' | 'flat'

export type ViewAngles = {
  mode: ViewMode
  /** rotateY in degrees (negative = show right face) */
  yaw: number
  /** rotateX in degrees (negative = show top face) */
  pitch: number
  /**
   * Perspective as a multiple of cube edge length (3–5).
   * Actual CSS perspective = edgePx * perspectiveFactor.
   */
  perspectiveFactor: number
  /** Extra silhouette fine-tune as fraction of cube edge (after auto-fit) */
  nudgeX: number
  nudgeY: number
}

export const VIEW_PRESETS: Record<ViewMode, Omit<ViewAngles, 'mode'>> = {
  angled: {
    yaw: -22,
    pitch: -19,
    perspectiveFactor: 4.2,
    nudgeX: 0,
    nudgeY: 0,
  },
  flat: {
    yaw: -8,
    pitch: -9,
    perspectiveFactor: 4.8,
    nudgeX: 0,
    nudgeY: 0,
  },
}

const STORAGE_KEY = 'flip-cube-view'

export function defaultView(mode: ViewMode = 'angled'): ViewAngles {
  return { mode, ...VIEW_PRESETS[mode] }
}

export function loadView(): ViewAngles {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultView('angled')
    const parsed = JSON.parse(raw) as Partial<ViewAngles> & {
      perspective?: number
    }
    const mode: ViewMode = parsed.mode === 'flat' ? 'flat' : 'angled'
    const base = defaultView(mode)
    // Migrate legacy fixed-px perspective → factor
    let perspectiveFactor = base.perspectiveFactor
    if (typeof parsed.perspectiveFactor === 'number') {
      perspectiveFactor = parsed.perspectiveFactor
    } else if (typeof parsed.perspective === 'number' && parsed.perspective > 0) {
      perspectiveFactor = clamp(parsed.perspective / 400, 3, 5)
    }
    return {
      mode,
      yaw: num(parsed.yaw, base.yaw),
      pitch: num(parsed.pitch, base.pitch),
      perspectiveFactor: clamp(perspectiveFactor, 3, 5),
      nudgeX: num(parsed.nudgeX, base.nudgeX),
      nudgeY: num(parsed.nudgeY, base.nudgeY),
    }
  } catch {
    return defaultView('angled')
  }
}

export function saveView(view: ViewAngles): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(view))
  } catch {
    /* ignore quota */
  }
}

export function applyPreset(mode: ViewMode): ViewAngles {
  return defaultView(mode)
}

export function viewToCssVars(
  view: ViewAngles,
  edgePx: number,
  fitOffsetX = 0,
  fitOffsetY = 0,
): Record<string, string> {
  const edge = Math.max(1, edgePx)
  const persp = edge * clamp(view.perspectiveFactor, 3, 5)
  return {
    '--cube-size': `${edge}px`,
    '--yaw': `${view.yaw}deg`,
    '--pitch': `${view.pitch}deg`,
    '--perspective': `${persp}px`,
    '--nudge-x': `${view.nudgeX * edge + fitOffsetX}px`,
    '--nudge-y': `${view.nudgeY * edge + fitOffsetY}px`,
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
