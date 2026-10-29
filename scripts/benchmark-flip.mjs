/**
 * Flip animation benchmark — primary vs Spacedesk.
 * Counts Layout / UpdateLayoutTree / Paint / Commit from the Chrome
 * performance trace that fall inside each flip animation window
 * (bounded by performance.mark flip-start-* / flip-end-* in the trace).
 *
 *   node scripts/benchmark-flip.mjs [--url=http://localhost:5173/] [--perf]
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'benchmarks')
const URL =
  process.argv.find((a) => a.startsWith('--url='))?.slice(6) ??
  'http://localhost:5173/'
const PERF_MODE = process.argv.includes('--perf')
const FLIPS = 10
const GAP_MS = 1000

const TRACE_NAMES = new Set([
  'Layout',
  'UpdateLayoutTree',
  'Paint',
  'PaintImage',
  'Commit',
])

function listMonitors() {
  const raw = execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(__dirname, 'list-monitors.ps1'),
    ],
    { encoding: 'utf8' },
  )
  const data = JSON.parse(raw)
  return Array.isArray(data) ? data : [data]
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  )
  return sorted[idx]
}

function summarizeFrameDeltas(allDeltas) {
  const sorted = [...allDeltas].sort((a, b) => a - b)
  const sum = sorted.reduce((a, b) => a + b, 0)
  const avg = sorted.length ? sum / sorted.length : 0
  return {
    sampleFrames: sorted.length,
    avgFps: avg > 0 ? 1000 / avg : 0,
    avgFrameMs: avg,
    p95FrameMs: percentile(sorted, 95),
    maxFrameMs: sorted.at(-1) ?? 0,
    over33ms: sorted.filter((d) => d > 33).length,
    over50ms: sorted.filter((d) => d > 50).length,
  }
}

/** Extract flip windows from UserTiming mark events in the trace. */
function flipWindowsFromTrace(events) {
  const starts = new Map()
  const ends = new Map()
  for (const e of events) {
    if (e.ph !== 'R' && e.ph !== 'I' && e.name !== 'TimeStamp' && e.name !== 'Mark') {
      // User Timing marks often appear as name === mark name with cat blink.user_timing
    }
    const name = e.name ?? ''
    const mStart = /^flip-start-(\d+)$/.exec(name)
    const mEnd = /^flip-end-(\d+)$/.exec(name)
    if (mStart) starts.set(Number(mStart[1]), e.ts)
    if (mEnd) ends.set(Number(mEnd[1]), e.ts)
  }
  const windows = []
  for (const [i, startTs] of starts) {
    const endTs = ends.get(i)
    if (endTs != null && endTs >= startTs) {
      windows.push({ index: i, startTs, endTs })
    }
  }
  return windows.sort((a, b) => a.index - b.index)
}

function countTraceInWindows(events, windows) {
  const totals = {
    Layout: 0,
    UpdateLayoutTree: 0,
    Paint: 0,
    PaintImage: 0,
    Commit: 0,
  }
  const perFlip = windows.map((w) => ({
    index: w.index,
    Layout: 0,
    UpdateLayoutTree: 0,
    Paint: 0,
    PaintImage: 0,
    Commit: 0,
    otherPaintLike: 0,
  }))
  const samples = []

  if (windows.length === 0) {
    return { totals, perFlip, windowsFound: 0, matchedEvents: 0, samples }
  }

  let matchedEvents = 0
  for (const e of events) {
    const name = e.name ?? ''
    if (!TRACE_NAMES.has(name)) continue
    const ts = e.ts
    if (typeof ts !== 'number') continue
    for (let i = 0; i < windows.length; i++) {
      const w = windows[i]
      if (ts >= w.startTs && ts <= w.endTs) {
        totals[name] += 1
        perFlip[i][name] += 1
        matchedEvents += 1
        if (
          (name === 'Layout' || name === 'UpdateLayoutTree') &&
          samples.length < 8
        ) {
          samples.push({
            name,
            flip: w.index,
            ts,
            dur: e.dur,
            args: e.args,
          })
        }
        break
      }
    }
  }

  // Only Layout + UpdateLayoutTree gate the "must fix" exit code
  const layoutUlt = totals.Layout + totals.UpdateLayoutTree
  const layoutPaintCommit =
    layoutUlt + totals.Paint + totals.PaintImage + totals.Commit

  return {
    totals,
    perFlip,
    windowsFound: windows.length,
    matchedEvents,
    layoutUlt,
    layoutPaintCommit,
    samples,
  }
}

async function runOnDisplay(browser, monitor, label) {
  const { X: x, Y: y, W: w, H: h } = monitor
  const context = await browser.newContext({ viewport: null })
  const page = await context.newPage()
  const client = await page.context().newCDPSession(page)

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(window.__flipCube), null, {
    timeout: 15000,
  })

  const { windowId } = await client.send('Browser.getWindowForTarget')
  await client.send('Browser.setWindowBounds', {
    windowId,
    bounds: {
      left: Math.round(x + 20),
      top: Math.round(y + 20),
      width: Math.min(Math.round(w - 40), 1280),
      height: Math.min(Math.round(h - 40), 800),
      windowState: 'normal',
    },
  })
  await page.waitForTimeout(400)

  const bounds = (await client.send('Browser.getWindowBounds', { windowId }))
    .bounds
  const cx = bounds.left + bounds.width / 2
  const cy = bounds.top + bounds.height / 2
  const onMonitor = cx >= x && cx < x + w && cy >= y && cy < y + h

  await page.evaluate((perf) => {
    window.__flipCube?.setPerfMode(perf)
  }, PERF_MODE)

  await page.evaluate(async () => {
    window.__flipCube?.flip(1, 'y')
    await new Promise((r) => setTimeout(r, 750))
  })

  const traceEvents = []
  const onTrace = (params) => {
    if (params.value?.length) traceEvents.push(...params.value)
  }
  client.on('Tracing.dataCollected', onTrace)
  await client.send('Tracing.start', {
    categories:
      'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,blink.console,benchmark',
  })

  const perFlip = await page.evaluate(
    async ({ flips, gapMs }) => {
      const results = []

      for (let i = 0; i < flips; i++) {
        while (window.__flipCube?.isFlipping()) {
          await new Promise((r) => requestAnimationFrame(r))
        }

        const deltas = []
        let last = performance.now()
        let recording = true
        const animStart = performance.now()
        const tick = (now) => {
          if (!recording) return
          deltas.push(now - last)
          last = now
          if (now - animStart < 580) requestAnimationFrame(tick)
          else recording = false
        }

        // Engine emits flip-start-N / flip-end-N around the CSS animation only
        requestAnimationFrame(tick)
        const before = performance.getEntriesByType('mark').length
        const ok = window.__flipCube?.flip(1, 'y') ?? false

        const waitStart = performance.now()
        while (window.__flipCube?.isFlipping()) {
          await new Promise((r) => requestAnimationFrame(r))
          if (performance.now() - waitStart > 2000) break
        }
        // Brief settle so end mark is emitted before next flip
        await new Promise((r) => requestAnimationFrame(r))
        recording = false
        void before

        const stats = window.__flipCube?.getLastFlipStats?.()
        results.push({
          ok,
          deltas,
          apiFrameCount: stats?.frameCount ?? deltas.length,
          apiMaxFrameMs: stats?.maxFrameMs ?? 0,
          wallMs: performance.now() - animStart,
        })

        await new Promise((r) => setTimeout(r, Math.max(0, gapMs - 650)))
      }
      return results
    },
    { flips: FLIPS, gapMs: GAP_MS },
  )

  await new Promise((resolve) => {
    const done = () => resolve()
    client.on('Tracing.tracingComplete', done)
    client.send('Tracing.end').catch(done)
    setTimeout(done, 5000)
  })
  client.off('Tracing.dataCollected', onTrace)

  const windows = flipWindowsFromTrace(traceEvents)
  const traceInFlips = countTraceInWindows(traceEvents, windows)

  const allDeltas = perFlip.flatMap((f) =>
    f.deltas.filter((d) => d > 0 && d < 400),
  )
  const frameSummary = summarizeFrameDeltas(allDeltas)
  const distinctPerFlip =
    perFlip.reduce((a, f) => a + (f.apiFrameCount || f.deltas.length), 0) /
    Math.max(1, perFlip.length)

  // Persist compact event name histogram inside windows for debugging
  const nameHist = {}
  for (const e of traceEvents) {
    const name = e.name ?? ''
    if (!TRACE_NAMES.has(name)) continue
    for (const w of windows) {
      if (e.ts >= w.startTs && e.ts <= w.endTs) {
        nameHist[name] = (nameHist[name] ?? 0) + 1
        break
      }
    }
  }

  const report = {
    label,
    monitor: { x, y, w, h, device: monitor.Device, primary: monitor.Primary },
    windowBounds: bounds,
    confirmedOnTargetDisplay: onMonitor,
    perfMode: PERF_MODE,
    flips: FLIPS,
    distinctFramesPerFlip: distinctPerFlip,
    ...frameSummary,
    traceWindowsFound: windows.length,
    traceDuringFlips: traceInFlips.totals,
    traceDuringFlipsTotal: traceInFlips.layoutPaintCommit,
    tracePerFlip: traceInFlips.perFlip,
    meetsTargets: {
      framesPerFlip30: distinctPerFlip >= 30,
      noFrameOver50: frameSummary.over50ms === 0,
      noLayoutInFlip: (traceInFlips.totals.Layout ?? 0) === 0,
      noUpdateLayoutTreeInFlip:
        (traceInFlips.totals.UpdateLayoutTree ?? 0) === 0,
    },
    perFlipApi: perFlip.map((f) => ({
      frames: f.apiFrameCount,
      maxMs: Number(Number(f.apiMaxFrameMs).toFixed(1)),
    })),
  }

  // Save a slice of mark-related events for audit
  const markDebug = traceEvents
    .filter((e) => String(e.name ?? '').startsWith('flip-'))
    .slice(0, 40)
    .map((e) => ({ name: e.name, ts: e.ts, ph: e.ph, cat: e.cat }))

  await context.close()
  return { report, markDebug, windows, nameHist }
}

async function launchBrowser() {
  const attempts = [{ channel: 'msedge' }, { channel: 'chrome' }, {}]
  for (const opts of attempts) {
    try {
      return await chromium.launch({
        headless: false,
        ...opts,
        args: [
          '--enable-gpu',
          '--ignore-gpu-blocklist',
          '--use-angle=d3d11',
          '--disable-features=CalculateNativeWinOcclusion',
        ],
      })
    } catch {
      /* try next */
    }
  }
  throw new Error('Could not launch Chromium/Chrome/Edge')
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const monitors = listMonitors()
  const primary = monitors.find((m) => m.Primary) ?? monitors[0]
  const secondary = monitors.find((m) => !m.Primary) ?? null

  console.log('Monitors:', JSON.stringify(monitors, null, 2))
  console.log('URL:', URL, 'perfMode:', PERF_MODE)

  const browser = await launchBrowser()
  const results = []
  const extras = []

  const primaryRun = await runOnDisplay(browser, primary, 'primary')
  results.push(primaryRun.report)
  extras.push({
    label: 'primary',
    markDebug: primaryRun.markDebug,
    windows: primaryRun.windows,
    nameHist: primaryRun.nameHist,
  })

  if (secondary) {
    const sec = await runOnDisplay(browser, secondary, 'spacedesk-or-secondary')
    results.push(sec.report)
    extras.push({
      label: 'spacedesk-or-secondary',
      markDebug: sec.markDebug,
      windows: sec.windows,
      nameHist: sec.nameHist,
    })
  } else {
    console.warn('No secondary monitor — Spacedesk may be disconnected.')
  }
  await browser.close()

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outFile = path.join(
    OUT_DIR,
    `flip-bench-${PERF_MODE ? 'perf-' : 'quality-'}${stamp}.json`,
  )
  fs.writeFileSync(
    outFile,
    JSON.stringify({ when: stamp, url: URL, results, extras }, null, 2),
  )

  console.log('\n=== BENCHMARK SUMMARY (trace-window Layout/Paint/Commit) ===')
  for (const r of results) {
    const t = r.traceDuringFlips
    console.log(
      `\n[${r.label}] onTarget=${r.confirmedOnTargetDisplay} windows=${r.traceWindowsFound}`,
    )
    console.log(
      `  avgFPS=${r.avgFps.toFixed(1)}  frames/flip≈${r.distinctFramesPerFlip.toFixed(1)}  max=${r.maxFrameMs.toFixed(1)}ms  >50ms=${r.over50ms}`,
    )
    console.log(
      `  IN-FLIP TRACE: Layout=${t.Layout} UpdateLayoutTree=${t.UpdateLayoutTree} Paint=${t.Paint} PaintImage=${t.PaintImage} Commit=${t.Commit}  TOTAL=${r.traceDuringFlipsTotal}`,
    )
    console.log(`  meets noLayoutPaintCommit=${r.meetsTargets.noLayoutPaintCommitInFlip}`)
  }
  for (const ex of extras) {
    console.log(`\n[${ex.label}] mark events sample:`, JSON.stringify(ex.markDebug.slice(0, 6)))
    console.log(`[${ex.label}] nameHist:`, ex.nameHist)
  }
  console.log('\nWrote', outFile)

  // Gate only on Layout / UpdateLayoutTree (Paint/Commit are acceptable)
  const failed = results.some((r) => {
    const t = r.traceDuringFlips
    return (t.Layout ?? 0) > 0 || (t.UpdateLayoutTree ?? 0) > 0
  })
  if (failed) process.exitCode = 2
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
