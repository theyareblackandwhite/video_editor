# PodCut - Web Based Video Editor

PodCut is a professional, client-side video editor designed for podcast creators. It allows you to sync audio from multiple sources and export high-quality video directly in your browser.

## Key Features

- **Client-Side Processing**: Uses FFmpeg.wasm for video rendering entirely in the browser.
- **Audio Sync**: Sync your microphone audio with video files seamlessly.
- **Persistence**: Projects and media are saved locally using IndexedDB and `localStorage`.
- **PWA Support**: Can be installed as a standalone app on your desktop or mobile device.

## Prerequisites

- **Node.js**: v18 or later recommended.
- **Browser**: A modern browser that supports SharedArrayBuffer (Chrome, Edge, Firefox).

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Run the Development Server

```bash
npm run dev
```

The app will be available at [http://localhost:5173/](http://localhost:5173/).

> [!IMPORTANT]
> Because this application uses FFmpeg, it requires **Cross-Origin Isolation** (COOP/COEP headers). Vite is already configured to provide these headers in development.

### 3. Production Build

To build the application for production:

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Technical Architecture

- **Foundation**: React + Vite + TypeScript
- **State Management**: Zustand (Feature-Sliced Design)
- **Processing**: FFmpeg.wasm (@ffmpeg/ffmpeg)
- **Styling**: Tailwind CSS
- **Persistence**: `idb-keyval` (IndexedDB) and `localStorage`
