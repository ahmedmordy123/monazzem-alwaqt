import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { create } from 'zustand'

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
  sound_path: null,
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
  init: () => Promise<void>
  flipSettle: (face: number) => Promise<void>
  tap: () => Promise<void>
  reset: () => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
}

let unlistenTimer: UnlistenFn | null = null

export const useTimerStore = create<TimerStore>((set, get) => ({
  initialized: false,
  settings: fallbackSettings,
  timer: fallbackTimer,
  init: async () => {
    if (get().initialized) return
    if (!isTauri()) {
      set({ initialized: true })
      return
    }

    const [snapshot, unlisten] = await Promise.all([
      invoke<AppSnapshot>('get_state'),
      listen<TimerEventPayload>('timer-event', ({ payload }) => {
        set({ timer: payload.snapshot })
      }),
    ])
    unlistenTimer?.()
    unlistenTimer = unlisten
    set({
      initialized: true,
      settings: snapshot.settings,
      timer: snapshot.timer,
    })
  },
  flipSettle: async (face) => {
    if (!isTauri()) {
      const minutes = get().settings.face_minutes[face] ?? 5
      set({
        timer: {
          state: 'Running',
          active_face: face,
          duration_ms: minutes * 60_000,
          remaining_ms: minutes * 60_000,
          end_at_ms: null,
        },
      })
      return
    }
    set({ timer: await invoke<TimerSnapshot>('flip_settle', { face }) })
  },
  tap: async () => {
    if (!isTauri()) return
    set({ timer: await invoke<TimerSnapshot>('tap') })
  },
  reset: async () => {
    if (!isTauri()) {
      set({ timer: fallbackTimer })
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

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
