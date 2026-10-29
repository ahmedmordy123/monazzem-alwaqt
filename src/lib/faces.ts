/** Default face durations in minutes (index 5 = custom). */
export const DEFAULT_FACES_MIN = [5, 15, 25, 45, 60, 10] as const

export type FaceIndex = 0 | 1 | 2 | 3 | 4 | 5

export function formatMmSs(totalSeconds: number): { mm: string; ss: string } {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const mm = Math.floor(clamped / 60)
  const ss = clamped % 60
  return {
    mm: String(mm).padStart(2, '0'),
    ss: String(ss).padStart(2, '0'),
  }
}

export function formatTimerMs(totalMs: number): {
  left: string
  right: string
  unit: 'MIN' | 'HR'
} {
  const seconds = Math.max(0, Math.ceil(totalMs / 1000))
  const totalMinutes = Math.ceil(seconds / 60)
  if (totalMinutes >= 100) {
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return {
      left: String(hours).padStart(2, '0').slice(-2),
      right: String(minutes).padStart(2, '0'),
      unit: 'HR',
    }
  }

  const { mm, ss } = formatMmSs(seconds)
  return { left: mm, right: ss, unit: 'MIN' }
}

export function faceLabel(minutes: number): string {
  return String(minutes).padStart(2, '0')
}
