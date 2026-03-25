# PodCut Architecture Overview

## 🏗️ Core Layers
PodCut is built with a strict separation of concerns to maximize harness-ability.

1.  **Processing Layer**: FFmpeg.wasm for video/audio manipulation.
2.  **State Layer**: Zustand with Feature-Sliced Design.
3.  **UI Layer**: Konva.js for high-performance canvas rendering.

## 🌉 Connectivity
- **Web Workers**: Offload heavy processing from the main thread.
- **IndexedDB**: Persistent storage for project media and metadata via `idb-keyval`.

## 🧪 Testing Infrastructure (Harnesses)
- **Logics**: Vitest runs our domain harnesses (`syncHarness`, `ffmpegHarness`).
- **State**: `stateValidator` middleware ensures real-time consistency.
