/** Clear finish alarm — loops until stop(); respects settings. */

let audio: HTMLAudioElement | null = null
let looping = false
let fadeRaf = 0

const DEFAULT_SRC = '/sounds/alarm.wav'
const FADE_MS = 800

function cancelFade() {
  if (fadeRaf) {
    cancelAnimationFrame(fadeRaf)
    fadeRaf = 0
  }
}

function fadeTo(el: HTMLAudioElement, target: number) {
  cancelFade()
  const start = performance.now()
  const from = el.volume
  const tick = (now: number) => {
    if (!looping || audio !== el) return
    const t = Math.min(1, (now - start) / FADE_MS)
    el.volume = from + (target - from) * t
    if (t < 1) fadeRaf = requestAnimationFrame(tick)
    else fadeRaf = 0
  }
  fadeRaf = requestAnimationFrame(tick)
}

export function stopAlarm() {
  looping = false
  cancelFade()
  if (!audio) return
  audio.pause()
  audio.currentTime = 0
}

export async function playAlarm(opts?: {
  enabled?: boolean
  volume?: number
  src?: string | null
}) {
  const enabled = opts?.enabled !== false
  if (!enabled) return

  stopAlarm()
  looping = true

  const src = opts?.src && opts.src.length > 0 ? opts.src : DEFAULT_SRC
  const targetVol = Math.max(0, Math.min(1, opts?.volume ?? 0.85))
  const el = new Audio(src)
  el.loop = true
  el.volume = 0
  audio = el

  const startFade = () => {
    if (!looping || audio !== el) return
    fadeTo(el, targetVol)
  }

  try {
    await el.play()
    startFade()
  } catch {
    // Autoplay may block until a gesture; retry once after click/tap on cube
    const unlock = () => {
      if (!looping || !audio) return
      void audio
        .play()
        .then(startFade)
        .catch(() => {})
      window.removeEventListener('pointerdown', unlock)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
  }
}

export function isAlarmPlaying(): boolean {
  return looping && !!audio && !audio.paused
}
