/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs';
import path from 'path';

// Helper to synchronize folders and skip large files for web production
const syncDir = (srcDir: string, destDir: string, skipLarge: boolean = true) => {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  fs.readdirSync(srcDir).forEach(file => {
    const src = path.join(srcDir, file);
    const dest = path.join(destDir, file);
    if (!fs.statSync(src).isFile()) return;

    const isProduction = process.env.NODE_ENV === 'production';
    const isTauriBuild = !!(process.env.TAURI_ENV || process.env.TAURI_PLATFORM || process.env.TAURI_ARCH);
    
    // Skip files > 24MB for production web builds (Cloudflare limit)
    // Tori builds still include them for offline support.
    if (skipLarge && isProduction && !isTauriBuild && fs.statSync(src).size > 24 * 1024 * 1024) {
      console.warn(`[Build] Skipping large asset ${file} for web production (CDN fallback will be used).`);
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      return;
    }

    if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
      fs.copyFileSync(src, dest);
    }
  });
};

const syncModels = () => {
  // 1. ONNX Runtime WASM (SIMD/Threaded)
  syncDir(
    path.resolve(__dirname, 'node_modules', 'onnxruntime-web', 'dist'),
    path.resolve(__dirname, 'public', 'models')
  );

  // 2. Silero VAD (only specific file)
  const vadSrc = path.resolve(__dirname, 'node_modules', '@ricky0123', 'vad-web', 'dist', 'silero_vad_legacy.onnx');
  if (fs.existsSync(vadSrc)) {
    const dest = path.resolve(__dirname, 'public', 'models', 'silero_vad_legacy.onnx');
    if (!fs.existsSync(dest) || fs.statSync(vadSrc).mtimeMs > fs.statSync(dest).mtimeMs) {
      fs.copyFileSync(vadSrc, dest);
    }
  }

  // 3. FFmpeg Core MT (Multi-threaded)
  syncDir(
    path.resolve(__dirname, 'node_modules', '@ffmpeg/core-mt', 'dist', 'esm'),
    path.resolve(__dirname, 'public', 'ffmpeg-mt')
  );
};

// Initial sync
syncModels();

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
