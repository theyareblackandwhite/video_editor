---
name: debug-legibility-tools
description: Uses CanvasSnapshot and FFmpegAudit to inspect Konva stage trees and FFmpeg command traces in PodCut. Use when debugging canvas layout, transformer state, export argv, or tracing which ffmpeg commands ran.
---

# Debug with legibility tools (PodCut)

## CanvasSnapshot (Konva)

**Module**: [src/test/harness/legibility/CanvasSnapshot.ts](src/test/harness/legibility/CanvasSnapshot.ts)

### Steps

1. Obtain a reference to the live `Konva.Stage` (e.g. from a `react-konva` `Stage` ref).
2. Call `captureCanvasSnapshot(stage)` to get a plain JSON-friendly tree (layers, nodes, attrs).
3. Optionally `logCanvasSnapshot(stage)` during local debugging to print a formatted snapshot.

### When to use

- Mismatched coordinates, missing layers, transformer not attaching, or suspected stale Konva nodes after React re-renders.

### Caution

- Prefer **dev-only** or **test** call sites; avoid shipping verbose logging in production hot paths.

## FFmpegAudit (command trace)

**Module**: [src/test/harness/legibility/FFmpegAudit.ts](src/test/harness/legibility/FFmpegAudit.ts)

### Steps

1. At the integration boundary where argv is finalized, call `ffmpegAudit.record({ ... })` with an **`AuditEntry`**: `timestamp` (e.g. `Date.now()`), `command` (argv **without** the `ffmpeg` binary name — class logs `ffmpeg ${command.join(' ')}`), `status: 'success' | 'failure'`, and optionally `durationMs` / `error`.
2. After the scenario, read `ffmpegAudit.getLogs()` (returns a copy of entries) or rely on the structured `console.warn` markers emitted by the auditor.
3. There is **no** `clear()` on the singleton today — prefer **one scenario per page load** or extend the auditor with a guarded `clear()` if tests need isolation.

### When to use

- “Which `-vf` / `-map` did we emit?” questions, ordering bugs, or verifying web vs Tauri branches hit the expected argv shape.

### Pair with

- Pure argv construction in [src/features/video-export/utils/ffmpegUtils.ts](src/features/video-export/utils/ffmpegUtils.ts) — fix logic there, use audit only to **observe**.

## Quick decision tree

```text
Problem in Konva / thumbnail editor? → CanvasSnapshot
Problem in export / filter graph / maps? → FFmpegAudit + unit tests on ffmpegUtils
Need deterministic CI without WASM? → ffmpegHarness mock (see write-harness skill)
```
