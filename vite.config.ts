/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs';
import path from 'path';

// Automatically sync AI models to public/models for offline Tauri
const modelsDir = path.resolve(__dirname, 'public', 'models');
if (!fs.existsSync(modelsDir)) {
  fs.mkdirSync(modelsDir, { recursive: true });
}

const wasmDist = path.resolve(__dirname, 'node_modules', 'onnxruntime-web', 'dist');
if (fs.existsSync(wasmDist)) {
  fs.readdirSync(wasmDist).forEach(file => {
    const src = path.join(wasmDist, file);
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(modelsDir, file));
    }
  });
}

const vadDist = path.resolve(__dirname, 'node_modules', '@ricky0123', 'vad-web', 'dist');
if (fs.existsSync(vadDist)) {
  ['silero_vad_legacy.onnx'].forEach(file => {
    const src = path.join(vadDist, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(modelsDir, file));
    }
  });
}

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024,
      },
      manifest: {
        name: 'PodCut PWA',
        short_name: 'PodCut',
        description: 'Client-side podcast video editor',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
})
