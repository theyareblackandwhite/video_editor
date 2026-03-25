# PodCut Agent Harness Index

Welcome, Agent. This repository is designed with **Harness Engineering** principles to maximize your autonomy and reliability.

## 🗺️ Repository Map

- **`src/test/harness/`**: Your primary playground. Contains mocks and synthetic data generators.
- **`src/app/store/middleware/stateValidator.ts`**: Real-time consistency checks. **Do not bypass.**
- **`docs/`**: The system of record for design and architecture.

## 🛠️ Tooling & Legibility

To "see" and verify the application state, use the following harnesses:
- **`CanvasSnapshot`**: Dumps Konva.js stage state.
- **`FFmpegAudit`**: Detailed command and timing logs.

## 📜 Standards
Refer to [docs/STANDARDS.md](file:///Users/enesgok/Documents/github/video_editor/docs/STANDARDS.md) for .antigravity coding rules.

## 🚀 Getting Started
1. Run `npm run test:harness` to verify the logic-layer.
2. Check `docs/QUALITY_SCORE.md` for current application legibility metrics.
3. Record your decisions in `docs/exec-plans/`.
