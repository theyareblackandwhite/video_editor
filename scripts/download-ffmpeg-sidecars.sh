#!/usr/bin/env bash
# Downloads static FFmpeg binaries (libass-enabled) for Tauri sidecars.
# Sources: eugeneware/ffmpeg-static (b6.1.1) for most targets; BtbN FFmpeg-Builds for Windows ARM64.
# Run from repo root: bash scripts/download-ffmpeg-sidecars.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/src-tauri/binaries"
TAG="b6.1.1"
STATIC_BASE="https://github.com/eugeneware/ffmpeg-static/releases/download/${TAG}"
BTBN="https://github.com/BtbN/FFmpeg-Builds/releases/download/latest"

mkdir -p "$DEST"

fetch_gunzip_to() {
  local url="$1"
  local out_path="$2"
  echo "Downloading -> $(basename "$out_path")"
  curl -fsSL "$url" | gunzip -c > "$out_path"
  chmod +x "$out_path"
}

fetch_btb_winarm64() {
  local zip="$DEST/_winarm64.zip"
  echo "Downloading BtbN winarm64 -> ffmpeg-aarch64-pc-windows-msvc.exe"
  curl -fsSL "${BTBN}/ffmpeg-master-latest-winarm64-gpl.zip" -o "$zip"
  unzip -p "$zip" "ffmpeg-master-latest-winarm64-gpl/bin/ffmpeg.exe" > "$DEST/ffmpeg-aarch64-pc-windows-msvc.exe"
  rm -f "$zip"
}

fetch_gunzip_to "${STATIC_BASE}/ffmpeg-darwin-arm64.gz" "$DEST/ffmpeg-aarch64-apple-darwin"
fetch_gunzip_to "${STATIC_BASE}/ffmpeg-darwin-x64.gz" "$DEST/ffmpeg-x86_64-apple-darwin"
fetch_gunzip_to "${STATIC_BASE}/ffmpeg-linux-x64.gz" "$DEST/ffmpeg-x86_64-unknown-linux-gnu"
fetch_gunzip_to "${STATIC_BASE}/ffmpeg-linux-arm64.gz" "$DEST/ffmpeg-aarch64-unknown-linux-gnu"
fetch_gunzip_to "${STATIC_BASE}/ffmpeg-win32-x64.gz" "$DEST/ffmpeg-x86_64-pc-windows-msvc.exe"

fetch_btb_winarm64

echo "Done. Files in $DEST"
ls -la "$DEST"
