export type ViewMode = 'angled' | 'flat'

export type ViewAngles = {
  mode: ViewMode
  /** rotateY in degrees (negative = show right face) */
  yaw: number
  /** rotateX in degrees (negative = show top face) */
  pitch: number
  /** CSS perspective in px */
  perspective: number
  /** Silhouette centering nudge as fraction of cube size */
  nudgeX: number
  nudgeY: number
}

export const VIEW_PRESETS: Record<ViewMode, Omit<ViewAngles, 'mode'>> = {
  // 3/4 product view: front glass + visible right + top numerals
  angled: {
    yaw: -22,
    pitch: -15,
    perspective: 1200,
    nudgeX: -0.09,
    nudgeY: 0.055,
  },
  // Near-front (previous flat look)
  flat: {
    yaw: -8,
    pitch: -9,
    perspective: 1400,
    nudgeX: -0.03,
    nudgeY: 0.02,
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
    const parsed = JSON.parse(raw) as Partial<ViewAngles>
    const mode: ViewMode = parsed.mode === 'flat' ? 'flat' : 'angled'
    const base = defaultView(mode)
    return {
      mode,
      yaw: num(parsed.yaw, base.yaw),
      pitch: num(parsed.pitch, base.pitch),
      perspective: num(parsed.perspective, base.perspective),
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

export function viewToCssVars(view: ViewAngles): Record<string, string> {
  return {
    '--yaw': `${view.yaw}deg`,
    '--pitch': `${view.pitch}deg`,
    '--perspective': `${view.perspective}px`,
    '--nudge-x': `calc(var(--cube-size) * ${view.nudgeX})`,
    '--nudge-y': `calc(var(--cube-size) * ${view.nudgeY})`,
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
