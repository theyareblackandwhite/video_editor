import { Command } from '@tauri-apps/plugin-shell';

/** Must match `bundle.externalBin` in `src-tauri/tauri.conf.json` (path relative to `src-tauri/`). */
export const FFMPEG_SIDECAR = 'binaries/ffmpeg';

/**
 * Native FFmpeg with libass (and other filters), bundled as a Tauri sidecar.
 * Run `bash scripts/download-ffmpeg-sidecars.sh` before `cargo tauri dev` / build.
 */
export function createFfmpegCommand(args: string | string[]): Command<string> {
    return Command.sidecar(FFMPEG_SIDECAR, args);
}
