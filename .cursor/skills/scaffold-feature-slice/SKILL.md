---
name: scaffold-feature-slice
description: Adds a PodCut wizard feature with a Zustand slice, App.tsx step wiring, and harness tests. Use when adding a new step, new feature folder, extending AppState, or registering a slice in src/app/store/index.ts.
---

# Scaffold feature + slice (PodCut)

## Preconditions

- Read [AGENTS.md](AGENTS.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [docs/STANDARDS.md](docs/STANDARDS.md).
- Wizard steps are **1–6**; changing count requires updating [src/app/store/middleware/stateValidator.ts](src/app/store/middleware/stateValidator.ts) and [src/App.tsx](src/App.tsx).

## Checklist

```text
- [ ] Create src/features/<feature>/ (components/, hooks/, store/, utils/)
- [ ] Add store/<feature>Slice.ts (StateCreator<AppState, [], [], XSlice>)
- [ ] Export slice + types; wire into src/app/store/index.ts (AppState + spread in create)
- [ ] If persisted: extend partialize in index.ts (metadata only for Files)
- [ ] Register step in App.tsx StepComponents (or adjust step map if replacing)
- [ ] Add src/test/harness/<feature>Harness.ts + tests (see write-harness skill)
- [ ] Run npm run test:harness && npm run lint:strict
```

## Slice template

Mirror [src/features/audio-sync/store/syncSlice.ts](src/features/audio-sync/store/syncSlice.ts):

1. `export interface XSlice { ... }`
2. `export const createXSlice: StateCreator<AppState, [], [], XSlice> = (set, get) => ({ ... })`
3. Use **functional** `set((state) => ({ ... }))` and immutable updates.
4. Call shared lifecycle hooks already used by other slices (e.g. `get().updateProjectState()` when the app expects project mutation side effects — follow neighboring slices).

## Store registration

In [src/app/store/index.ts](src/app/store/index.ts):

- Import `createXSlice` and `XSlice`.
- `export type AppState = ... & XSlice`.
- Spread `...createXSlice(...a)` into the combined object **inside** `stateValidator(...)`.

## Thumbnail / separate stores

If the feature is **canvas-heavy with undo history**, evaluate a dedicated store like [src/store/thumbnailSlice.ts](src/store/thumbnailSlice.ts) instead of expanding `AppState`.

## Do not

- Bypass `stateValidator` or `persist` ordering.
- Import another feature’s internals from `src/features/<other>/` — use `src/shared/` or a thin public `index.ts`.
