import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import type { MediaFile, CutSegment, ShortsConfig, ShortsClip } from '../../../app/store/types';
import { buildFFmpegCommand, type ExportConfig } from './ffmpegUtils';
import { safeConvertFileSrc } from '../../../shared/utils/tauri';

let ffmpegInstance: FFmpeg | null = null;

export async function getFFmpeg() {
    if (ffmpegInstance) return ffmpegInstance;

    const ffmpeg = new FFmpeg();
    
    // In production/PWA, we might want to host these yourself. 
    // For now, using standard cloudflare/unpkg CDNs.
    const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.6/dist/esm';
    
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
    });

    ffmpegInstance = ffmpeg;
    return ffmpeg;
}

/**
 * Generates a PNG mask with black corners and a transparent rounded center.
 * This is used for fast "fake" rounded corners on the web.
 */
async function generateRoundedCornerMask(w: number, h: number, r: number): Promise<Uint8Array> {
    // We use OffscreenCanvas if available, otherwise regular canvas
    let canvas: any;
    if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(w, h);
    } else {
        canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context could not be created');

    // 1. Fill entire canvas with black
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);

    // 2. Clear the center with a rounded rectangle
    // Clip method is reliable:
    ctx.globalCompositeOperation = 'destination-out';
    
    // Draw rounded rect path
    const x = 0;
    const y = 0;
    const radius = Math.min(r, w / 2, h / 2);
    
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    ctx.fill();

    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        return new Uint8Array(await blob.arrayBuffer());
    } else {
        return new Promise((resolve) => {
            canvas.toBlob(async (blob: Blob | null) => {
                if (!blob) throw new Error('Blob creation failed');
                resolve(new Uint8Array(await blob.arrayBuffer()));
            }, 'image/png');
        });
    }
}

export async function exportVideoWeb(
    config: ExportConfig,
    masterVideo: MediaFile,
    videoFiles: MediaFile[],
    audioFiles: MediaFile[],
    cuts: CutSegment[],
    totalDuration: number,
    onProgress: (p: number) => void,
    onLog?: (msg: string) => void,
    shortsConfig?: ShortsConfig,
    activeClip?: ShortsClip,
    cropFileContent?: string,
    subtitleFileContent?: string
): Promise<Uint8Array> {
    const ffmpeg = await getFFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
        onProgress(progress);
    });

    if (onLog) {
        ffmpeg.on('log', ({ message }) => onLog(message));
    }

    try {
        // 1. Prepare files in virtual FS
        // We MUST map long paths/blob URLs to short, valid filenames for FFmpeg CLI
        const fileMap = new Map<string, string>();
        
        const registerFile = async (mf: MediaFile, prefix: string, index: number) => {
            const ext = mf.name.split('.').pop() || (mf.type.includes('video') ? 'mp4' : 'mp3');
            const virtualName = `${prefix}_${index}.${ext}`;
            fileMap.set(mf.id, virtualName);
            
            // Read binary data
            let data: Uint8Array;
            if (mf.file) {
                data = new Uint8Array(await mf.file.arrayBuffer());
            } else {
                // Fallback to fetching from blob URL
                const response = await fetch(safeConvertFileSrc(mf.path));
                data = new Uint8Array(await response.arrayBuffer());
            }
            
            await ffmpeg.writeFile(virtualName, data);
            return virtualName;
        };

        // Master video always index 0 relative to videoFiles
        await registerFile(masterVideo, 'v', 0);
        
        const otherVideos = videoFiles.filter(v => v.id !== masterVideo.id);
        for (let i = 0; i < otherVideos.length; i++) {
            await registerFile(otherVideos[i], 'v', i + 1);
        }

        if (config.includeAudio) {
            for (let i = 0; i < audioFiles.length; i++) {
                await registerFile(audioFiles[i], 'a', i);
            }
        }

        // Sidecar files
        let virtualCropPath: string | undefined;
        if (cropFileContent) {
            virtualCropPath = 'crop.txt';
            await ffmpeg.writeFile(virtualCropPath, cropFileContent);
        }

        let virtualSubtitlePath: string | undefined;
        if (subtitleFileContent) {
            virtualSubtitlePath = 'subtitles.ass';
            await ffmpeg.writeFile(virtualSubtitlePath, subtitleFileContent);
        }

        let virtualMaskPath: string | undefined;
        if (config.borderRadius > 0) {
            virtualMaskPath = 'mask.png';
            // Output dimensions for mask depend on layout mode
            // Consistent with ffmpegUtils.ts
            const w = config.layoutMode === 'crop' ? 720 * videoFiles.length : 1280;
            const h = 720;
            const maskData = await generateRoundedCornerMask(w, h, config.borderRadius);
            await ffmpeg.writeFile(virtualMaskPath, maskData);
        }

        // 2. Build command arguments with VIRTUAL paths
        // Create a copy of the state where paths are replaced with virtual names
        const virtualVideoFiles = videoFiles.map(v => ({ ...v, path: fileMap.get(v.id)! }));
        const virtualAudioFiles = audioFiles.map(a => ({ ...a, path: fileMap.get(a.id)! }));
        
        // Force libx264 for web (WASM doesn't have videotoolbox/nvenc)
        const webConfig = { ...config };
        
        const outputName = `output.${config.format}`;

        const args = buildFFmpegCommand(
            webConfig,
            cuts,
            totalDuration,
            virtualVideoFiles,
            virtualAudioFiles,
            masterVideo.id,
            outputName,
            virtualCropPath,
            shortsConfig,
            activeClip,
            virtualSubtitlePath,
            virtualMaskPath,
            720 // Cap height to 720p on web for performance
        );

        // Remove hardware acceleration or platform-specific args if buildFFmpegCommand added them
        // Actually, buildFFmpegCommand uses navigator.userAgent to decide, which might be okay,
        // but WASM FFmpeg ALWAYS needs libx264/libvpx.
        const filteredArgs = args.map(arg => {
            if (arg === 'h264_videotoolbox' || arg === 'h264_nvenc') return 'libx264';
            return arg;
        });

        // 3. Execute
        await ffmpeg.exec(filteredArgs);

        // 4. Read result
        const data = await ffmpeg.readFile(outputName);
        
        // Cleanup virtual FS
        for (const vName of fileMap.values()) {
            await ffmpeg.deleteFile(vName).catch(() => {});
        }
        if (virtualCropPath) await ffmpeg.deleteFile(virtualCropPath).catch(() => {});
        if (virtualSubtitlePath) await ffmpeg.deleteFile(virtualSubtitlePath).catch(() => {});
        if (virtualMaskPath) await ffmpeg.deleteFile(virtualMaskPath).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

        return data as Uint8Array;

    } catch (error) {
        console.error('[FFmpegWeb] Export failed:', error);
        throw error;
    }
}
