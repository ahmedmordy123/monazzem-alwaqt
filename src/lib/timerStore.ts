import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { create } from 'zustand'
import { playAlarm, stopAlarm } from './alarm'

export type TimerState = 'Idle' | 'Running' | 'Paused' | 'Finished'

export type TimerSnapshot = {
  state: TimerState
  active_face: number
  duration_ms: number
  remaining_ms: number
  end_at_ms: number | null
}

export type AppSettings = {
  face_minutes: [number, number, number, number, number, number]
  theme: 'white' | 'black'
  language: 'ar' | 'en'
  sound_enabled: boolean
  sound_path: string | null
  view_mode: 'angled' | 'flat'
  display_mode: 'deskcube' | 'widget'
  yaw: number
  pitch: number
  perspective_factor: number
  perf_mode: boolean
  autostart: boolean
  target_monitor_id: string | null
  widget_position: { x: number; y: number } | null
  idle_dim_minutes: number
  nudge_offsets: { x: number; y: number }
}

type AppSnapshot = {
  timer: TimerSnapshot
  settings: AppSettings
}

type TimerEventPayload = {
  snapshot: TimerSnapshot
}

const fallbackSettings: AppSettings = {
  face_minutes: [5, 15, 25, 45, 60, 10],
  theme: 'white',
  language: 'ar',
  sound_enabled: true,
  sound_path: '/sounds/alarm.wav',
  view_mode: 'angled',
  display_mode: 'deskcube',
  yaw: -22,
  pitch: -19,
  perspective_factor: 4.2,
  perf_mode: false,
  autostart: false,
  target_monitor_id: null,
  widget_position: null,
  idle_dim_minutes: 10,
  nudge_offsets: { x: 8, y: 8 },
}

const fallbackTimer: TimerSnapshot = {
  state: 'Idle',
  active_face: 0,
  duration_ms: 300_000,
  remaining_ms: 300_000,
  end_at_ms: null,
}

type TimerStore = {
  initialized: boolean
  settings: AppSettings
  timer: TimerSnapshot
  alarmActive: boolean
  init: () => Promise<void>
  flipSettle: (face: number) => Promise<void>
  tap: () => Promise<void>
  reset: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  dismissAlarm: () => void
  markFinishedLocal: () => void
}

let unlistenTimer: UnlistenFn | null = null
let browserTick: number | null = null

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function nowMs(): number {
  return Date.now()
}

function clampRemaining(remaining: number, duration: number): number {
  return Math.max(0, Math.min(duration, remaining))
}

function stopBrowserTick() {
  if (browserTick !== null) {
    window.clearInterval(browserTick)
    browserTick = null
  }
}

function startBrowserTick(get: () => TimerStore, set: (p: Partial<TimerStore>) => void) {
  stopBrowserTick()
  browserTick = window.setInterval(() => {
    const t = get().timer
    if (t.state !== 'Running' || t.end_at_ms == null) {
      stopBrowserTick()
      return
    }
    const remaining = clampRemaining(t.end_at_ms - nowMs(), t.duration_ms)
    if (remaining <= 0) {
      stopBrowserTick()
      set({
        timer: {
          ...t,
          state: 'Finished',
          remaining_ms: 0,
          end_at_ms: null,
        },
      })
      get().markFinishedLocal()
      return
    }
    set({ timer: { ...t, remaining_ms: remaining } })
  }, 250)
}

function faceDurationMs(settings: AppSettings, face: number): number {
  const minutes = settings.face_minutes[face] ?? 5
  return Math.max(1, minutes) * 60_000
}

function triggerFinishAlarm(get: () => TimerStore, set: (p: Partial<TimerStore>) => void) {
  const s = get().settings
  set({ alarmActive: true })
  void playAlarm({
    enabled: s.sound_enabled,
    volume: 0.9,
    src: s.sound_path,
  })
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  initialized: false,
  settings: fallbackSettings,
  timer: fallbackTimer,
  alarmActive: false,
  dismissAlarm: () => {
    stopAlarm()
    set({ alarmActive: false })
  },
  markFinishedLocal: () => {
    triggerFinishAlarm(get, set)
  },
  init: async () => {
    if (get().initialized) return
    if (!isTauri()) {
      set({ initialized: true })
      return
    }

    const [snapshot, unlisten, unlistenFinished] = await Promise.all([
      invoke<AppSnapshot>('get_state'),
      listen<TimerEventPayload>('timer-event', ({ payload }) => {
        set({ timer: payload.snapshot })
      }),
      listen('timer-finished', () => {
        triggerFinishAlarm(get, set)
      }),
    ])
    unlistenTimer?.()
    unlistenTimer = () => {
      unlisten()
      unlistenFinished()
    }
    set({
      initialized: true,
      settings: snapshot.settings,
      timer: snapshot.timer,
    })
  },
  flipSettle: async (face) => {
    get().dismissAlarm()
    if (!isTauri()) {
      const duration = faceDurationMs(get().settings, face)
      const end = nowMs() + duration
      set({
        timer: {
          state: 'Running',
          active_face: face,
          duration_ms: duration,
          remaining_ms: duration,
          end_at_ms: end,
        },
      })
      startBrowserTick(get, set)
      return
    }
    set({ timer: await invoke<TimerSnapshot>('flip_settle', { face }) })
  },
  tap: async () => {
    const t = get().timer
    if (t.state === 'Finished' || get().alarmActive) {
      get().dismissAlarm()
      if (!isTauri()) {
        const duration = faceDurationMs(get().settings, t.active_face)
        set({
          timer: {
            state: 'Idle',
            active_face: t.active_face,
            duration_ms: duration,
            remaining_ms: duration,
            end_at_ms: null,
          },
        })
        return
      }
      set({ timer: await invoke<TimerSnapshot>('reset') })
      return
    }
    if (!isTauri()) {
      if (t.state === 'Running') {
        stopBrowserTick()
        const remaining = clampRemaining(
          t.end_at_ms != null ? t.end_at_ms - nowMs() : t.remaining_ms,
          t.duration_ms,
        )
        set({
          timer: {
            ...t,
            state: 'Paused',
            remaining_ms: remaining,
            end_at_ms: null,
          },
        })
        return
      }
      if (t.state === 'Paused') {
        const remaining = clampRemaining(t.remaining_ms, t.duration_ms)
        set({
          timer: {
            ...t,
            state: 'Running',
            remaining_ms: remaining,
            end_at_ms: nowMs() + remaining,
          },
        })
        startBrowserTick(get, set)
        return
      }
      if (t.state === 'Idle') {
        const duration = faceDurationMs(get().settings, t.active_face)
        set({
          timer: {
            state: 'Running',
            active_face: t.active_face,
            duration_ms: duration,
            remaining_ms: duration,
            end_at_ms: nowMs() + duration,
          },
        })
        startBrowserTick(get, set)
      }
      return
    }
    set({ timer: await invoke<TimerSnapshot>('tap') })
  },
  reset: async () => {
    get().dismissAlarm()
    if (!isTauri()) {
      stopBrowserTick()
      const face = get().timer.active_face
      const duration = faceDurationMs(get().settings, face)
      set({
        timer: {
          state: 'Idle',
          active_face: face,
          duration_ms: duration,
          remaining_ms: duration,
          end_at_ms: null,
        },
      })
      return
    }
    set({ timer: await invoke<TimerSnapshot>('reset') })
  },
  saveSettings: async (settings) => {
    if (!isTauri()) {
      set({ settings })
      return
    }
    const snapshot = await invoke<AppSnapshot>('save_settings', { settings })
    set({ settings: snapshot.settings, timer: snapshot.timer })
  },
}))

declare global {
  interface Window {
    __timerStore?: typeof useTimerStore
  }
}

if (typeof window !== 'undefined') {
  window.__timerStore = useTimerStore
}
