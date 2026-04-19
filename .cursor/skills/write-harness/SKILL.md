---
name: write-harness
description: Creates PodCut test harnesses — FFmpeg mocks, synthetic signals, Vitest in src/test/harness. Use when adding harness tests, mocking FFmpeg without WASM, or testing complex pure utilities without I/O.
---

# Write harness (PodCut)

## When to use

- New math, correlation, layout, or argv-building logic that should run in CI **without** WASM, real files, or network.
- FFmpeg-related tests: **always** use [src/test/harness/ffmpegHarness.ts](src/test/harness/ffmpegHarness.ts), not `@ffmpeg/ffmpeg` in unit tests.

## Patterns

### 1. Synthetic data + pure validators

Example: [src/test/harness/syncHarness.ts](src/test/harness/syncHarness.ts)

- Export small factories (`createSyntheticSignal`) and validators (`validateCorrelationResult`) with **typed** inputs/outputs.
- Keep allocations bounded; document sample rates / lengths in JSDoc if non-obvious.

### 2. FFmpeg mock (virtual FS + exec)

Example: [src/test/harness/ffmpegHarness.ts](src/test/harness/ffmpegHarness.ts)

- Implement `load`, `writeFile`, `readFile`, `exec` compatible with call sites under test.
- Validate `-i` inputs exist in the in-memory map; throw clear errors (see [src/test/harness/harness.test.ts](src/test/harness/harness.test.ts)).

### 3. Legibility helpers

- [src/test/harness/legibility/CanvasSnapshot.ts](src/test/harness/legibility/CanvasSnapshot.ts) — structure dumps for Konva.
- [src/test/harness/legibility/FFmpegAudit.ts](src/test/harness/legibility/FFmpegAudit.ts) — append-only command audit for integration-style checks.

## Vitest stub

Add cases to [src/test/harness/harness.test.ts](src/test/harness/harness.test.ts) or a colocated `*.test.ts` under `src/test/harness/` (still picked up by `vitest run --dir src/test/harness` only if inside that directory — prefer extending `harness.test.ts` or keep new tests under `src/test/harness/`).

Minimal pattern:

```ts
import { describe, it, expect } from 'vitest';
import { myFactory } from './myHarness';

describe('MyHarness', () => {
  it('covers edge case', () => {
    expect(myFactory()).toMatchObject({ ok: true });
  });
});
```

## Verification

Run:

```bash
npm run test:harness
```

## Anti-patterns

- Pulling real `FFmpeg` or large model weights into harness tests.
- Silent swallowing of validation errors — harnesses should **fail loudly** with actionable messages.
