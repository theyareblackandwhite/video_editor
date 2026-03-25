# .antigravity Coding Standards

## 🏎️ Performance
- **No Nested Loops**: Avoid O(n²) operations on large media or frame arrays.
- **Lazy Loading**: Heavy WASM modules (FFmpeg, MediaPipe) must be loaded dynamically.

## 🛡️ Style & Type Safety
- **Strict Typing**: `strict: true` is mandatory. No `any` allowed.
- **Immutable State**: Use Zustand's functional updates to prevent side effects.
- **Fail Fast**: All state mutations must pass through `stateValidator.ts`.

## 🤖 Agent Legibility
- **Self-Documenting Code**: Use descriptive type names (`MediaFileId`, `TimestampSeconds`).
- **Harness Support**: Every new complex utility must have a corresponding harness in `src/test/harness/`.
