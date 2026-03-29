/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs';
import path from 'path';

// Automatically sync AI models to public/models for offline Tauri
const syncModels = () => {
  const modelsDir = path.resolve(__dirname, 'public', 'models');
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const wasmDist = path.resolve(__dirname, 'node_modules', 'onnxruntime-web', 'dist');
  if (fs.existsSync(wasmDist)) {
    fs.readdirSync(wasmDist).forEach(file => {
      const src = path.join(wasmDist, file);
      const dest = path.join(modelsDir, file);
      if (fs.statSync(src).isFile()) {
        // Skip files > 25MB for production web builds to avoid Cloudflare limits.
        // Tauri builds should still include them for offline support.
        const isProduction = process.env.NODE_ENV === 'production';
        const isTauriBuild = !!(process.env.TAURI_ENV || process.env.TAURI_PLATFORM || process.env.TAURI_ARCH);
        
        if (isProduction && !isTauriBuild && fs.statSync(src).size > 24 * 1024 * 1024) {
          console.warn(`[Build] Skipping large asset ${file} for web production (CDN fallback will be used).`);
          // Ensure file is deleted from public/models so it's not copied to dist
          if (fs.existsSync(dest)) {
            fs.unlinkSync(dest);
          }
          return;
        }

        if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
          fs.copyFileSync(src, dest);
        }
      }
    });
  }

  const vadDist = path.resolve(__dirname, 'node_modules', '@ricky0123', 'vad-web', 'dist');
  if (fs.existsSync(vadDist)) {
    ['silero_vad_legacy.onnx'].forEach(file => {
      const src = path.join(vadDist, file);
      const dest = path.join(modelsDir, file);
      if (fs.existsSync(src)) {
        if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
          fs.copyFileSync(src, dest);
        }
      }
    });
  }
};

// Only run initial sync once per process if possible, or just optimize it
if (process.env.NODE_ENV !== 'production' && !process.env.VITE_MODELS_SYNCED) {
  syncModels();
  process.env.VITE_MODELS_SYNCED = 'true';
} else if (process.env.NODE_ENV === 'production') {
  syncModels();
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
