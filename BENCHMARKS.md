# Benchmarks

## Flip animation (M0 baseline — Playwright CDP)

| Display | Frames/flip | p95 frame | Max frame | Notes |
|---------|-------------|-----------|-----------|-------|
| Primary (quality) | ~32 | &lt;16ms | &lt;50ms | Layout in flip window = 0 after delayed mark |
| Primary (perf `P`) | stepped 8 | — | — | Intentionally stepped |
| Spacedesk | *pending manual* | | | Streaming latency not measured in CI |

## Process tree RAM / CPU

| Mode | RSS tree (app + WebView2) | Idle CPU |
|------|---------------------------|----------|
| Goal | &lt; 60 MB idle | ~0% |
| Measured | *pending `tauri build` + soak* | *pending* |

Mitigations planned: single WebView, tick thread only while Running, perf mode, no network.

## Soak (30 min)

| Metric | Result |
|--------|--------|
| Memory growth | *pending* |
| Idle CPU | *pending* |

## Before / after visual fit

| Viewport | Center err X | Center err Y |
|----------|--------------|--------------|
| 1629×973 | ≤0.01% (DOM silhouette) | ≤0.01% |
| 6 random 1200×700–2200×1300 | ALL_PASS ≤1% | ALL_PASS |
