import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
    Download, ArrowLeft, Film, Volume2, Settings, Check,
    Loader2, FileVideo, HardDrive, Clock, Sparkles, AudioLines, AlertTriangle
} from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { useFFmpeg } from '../../../hooks/useFFmpeg';
import { buildFFmpegCommand, type ExportConfig } from '../../../utils/ffmpegUtils';
import { fetchFile } from '@ffmpeg/util';

/* ── Types ── */
type ExportPhase = 'config' | 'processing' | 'done';

const QUALITY_LABELS: Record<ExportConfig['quality'], { label: string; desc: string; icon: string }> = {
    high: { label: 'Yüksek Kalite', desc: 'Orijinal çözünürlük, büyük dosya', icon: '🎬' },
    medium: { label: 'Orta Kalite', desc: 'Dengeli boyut ve kalite', icon: '📹' },
    low: { label: 'Düşük Kalite', desc: 'Hızlı dışa aktarım, küçük dosya', icon: '📱' },
};

const FORMAT_LABELS: Record<ExportConfig['format'], { label: string; desc: string }> = {
    mp4: { label: 'MP4 (H.264)', desc: 'En yaygın format, her yerde oynatılır' },
    webm: { label: 'WebM (VP9)', desc: 'Web dostu, küçük boyut' },
};

const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
};

const fmtSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const Step4Export: React.FC = () => {
    const { videoFiles, audioFiles, cuts, layoutMode, transitionType, setStep } = useAppStore();
    const { ffmpeg, load, isLoaded, isLoading: isFfmpegLoading, message: ffmpegMessage } = useFFmpeg();

    const masterVideo = videoFiles.find(v => v.isMaster) || videoFiles[0];

    const [phase, setPhase] = useState<ExportPhase>('config');
    const [config, setConfig] = useState<ExportConfig>({
        format: 'mp4',
        quality: 'high',
        includeAudio: audioFiles.length > 0,
        applyCuts: cuts.length > 0,
        normalizeAudio: true,
        layoutMode,
        transitionType
    });
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState('');
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [outputUrl, setOutputUrl] = useState('');
    const [elapsedTime, setElapsedTime] = useState(0);

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Initialize FFmpeg
    useEffect(() => {
        load();
    }, [load]);

    // Cleanup URLs
    useEffect(() => {
        return () => {
            if (outputUrl) URL.revokeObjectURL(outputUrl);
        };
    }, [outputUrl]);

    // Timer for elapsed time during processing
    useEffect(() => {
        if (phase === 'processing') {
            timerRef.current = setInterval(() => setElapsedTime(t => t + 1), 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [phase]);

    /* ── Estimated file size ── */
    const estimatedSize = masterVideo
        ? (() => {
            // Rough estimate based on master video and number of additional videos
            const baseSize = masterVideo.file.size * (1 + (videoFiles.length - 1) * 0.5);
            const qualityMultiplier = config.quality === 'high' ? 1 : config.quality === 'medium' ? 0.6 : 0.3;
            const formatMultiplier = config.format === 'webm' ? 0.7 : 1;
            let cutReduction = 1;
            if (config.applyCuts && cuts.length > 0) {
                cutReduction = 0.8; // Rough estimate
            }
            return Math.round(baseSize * qualityMultiplier * formatMultiplier * cutReduction);
        })()
        : 0;

    /* ── Export handler ── */
    const handleExport = useCallback(async () => {
        if (!masterVideo || !isLoaded) return;

        setPhase('processing');
        setProgress(0);
        setElapsedTime(0);
        setProgressLabel('FFmpeg başlatılıyor...');

        try {
            // 1. Get Master Video Duration
            setProgressLabel('Video analiz ediliyor...');
            const tempVideo = document.createElement('video');
            tempVideo.src = URL.createObjectURL(masterVideo.file);
            await new Promise((resolve) => {
                tempVideo.onloadedmetadata = resolve;
            });
            const duration = tempVideo.duration;
            URL.revokeObjectURL(tempVideo.src);

            // 2. Write Files
            setProgressLabel('Dosyalar belleğe yükleniyor...');

            // Write master video as index 0
            await ffmpeg.writeFile('input_video_0', await fetchFile(masterVideo.file));

            // Write other videos
            const otherVideos = videoFiles.filter(v => v.id !== masterVideo.id);
            for (let i = 0; i < otherVideos.length; i++) {
                await ffmpeg.writeFile(`input_video_${i + 1}`, await fetchFile(otherVideos[i].file));
            }

            // Write audio files
            if (config.includeAudio) {
                for (let i = 0; i < audioFiles.length; i++) {
                    await ffmpeg.writeFile(`input_audio_${i}`, await fetchFile(audioFiles[i].file));
                }
            }

            // 3. Build Command
            const args = buildFFmpegCommand(config, cuts, duration, videoFiles, audioFiles, masterVideo.id);
            console.log('FFmpeg Command:', args.join(' '));

            // 4. Execute
            setProgressLabel('Video işleniyor...');

            ffmpeg.on('progress', ({ progress }) => {
                // FFmpeg reports progress 0-1
                setProgress(Math.max(0, Math.min(1, progress)));
            });

            await ffmpeg.exec(args);

            // 5. Read Output
            setProgressLabel('Sonuç dosyası oluşturuluyor...');
            const outputFilename = `output.${config.format}`;
            const data = await ffmpeg.readFile(outputFilename);
            // Cast data to any to handle SharedArrayBuffer type mismatch
            const blob = new Blob([data as Uint8Array], { type: `video/${config.format}` });
            const url = URL.createObjectURL(blob);

            setOutputBlob(blob);
            setOutputUrl(url);
            setPhase('done');

            // 6. Cleanup
            try {
                await ffmpeg.deleteFile('input_video_0');
                const otherVideos = videoFiles.filter(v => v.id !== masterVideo.id);
                for (let i = 0; i < otherVideos.length; i++) {
                    await ffmpeg.deleteFile(`input_video_${i + 1}`);
                }
                if (config.includeAudio) {
                    for (let i = 0; i < audioFiles.length; i++) {
                        await ffmpeg.deleteFile(`input_audio_${i}`);
                    }
                }
                await ffmpeg.deleteFile(outputFilename);
            } catch (cleanupErr) {
                console.warn('Cleanup warning:', cleanupErr);
            }

        } catch (e) {
            console.error('Export failed:', e);
            setPhase('config');
            alert(`Dışa aktarım başarısız oldu: ${e instanceof Error ? e.message : 'Bilinmeyen hata'}`);
        }
    }, [videoFiles, audioFiles, masterVideo, config, cuts, isLoaded, ffmpeg]);

    /* ── Download ── */
    const handleDownload = useCallback(() => {
        if (!outputUrl || !masterVideo) return;
        const name = masterVideo.file.name.replace(/\.[^/.]+$/, '');
        const ext = config.format;
        const a = document.createElement('a');
        a.href = outputUrl;
        a.download = `${name}_podcut.${ext}`;
        a.click();
    }, [outputUrl, config.format, masterVideo]);

    /* ── Render ── */
    return (
        <div className="max-w-4xl mx-auto py-8 px-4">

            {/* ── Config Phase ── */}
            {phase === 'config' && (
                <>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900">Dışa Aktar</h2>
                            <p className="text-sm text-gray-500">Çıktı ayarlarını seçin ve videonuzu kaydedin.</p>
                        </div>
                        <button
                            onClick={() => setStep(3)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                        >
                            <ArrowLeft size={16} /> Geri
                        </button>
                    </div>

                    {!isLoaded && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                            <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h4 className="font-semibold text-yellow-800">FFmpeg Yükleniyor...</h4>
                                <p className="text-sm text-yellow-700 mt-1">
                                    Video işleme motoru tarayıcınıza yükleniyor. İlk yükleme internet hızınıza bağlı olarak zaman alabilir.
                                </p>
                                {isFfmpegLoading && <Loader2 className="animate-spin mt-2 text-yellow-600" size={20} />}
                                {ffmpegMessage && <p className="text-sm text-red-600 mt-2">{ffmpegMessage}</p>}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left: Settings */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Format */}
                            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Film size={18} className="text-gray-500" />
                                    <h3 className="font-semibold text-gray-800">Video Formatı</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    {(Object.entries(FORMAT_LABELS) as [ExportConfig['format'], typeof FORMAT_LABELS['mp4']][]).map(([key, val]) => (
                                        <button
                                            key={key}
                                            onClick={() => setConfig(c => ({ ...c, format: key }))}
                                            className={`p-4 rounded-xl border-2 text-left transition-all ${config.format === key
                                                ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                                                : 'border-gray-100 hover:border-gray-300 bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-semibold text-sm text-gray-800">{val.label}</span>
                                                {config.format === key && <Check size={16} className="text-blue-600" />}
                                            </div>
                                            <span className="text-xs text-gray-400">{val.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Quality */}
                            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Settings size={18} className="text-gray-500" />
                                    <h3 className="font-semibold text-gray-800">Kalite</h3>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {(Object.entries(QUALITY_LABELS) as [ExportConfig['quality'], typeof QUALITY_LABELS['high']][]).map(([key, val]) => (
                                        <button
                                            key={key}
                                            onClick={() => setConfig(c => ({ ...c, quality: key }))}
                                            className={`p-4 rounded-xl border-2 text-center transition-all ${config.quality === key
                                                ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-100'
                                                : 'border-gray-100 hover:border-gray-300 bg-white'
                                                }`}
                                        >
                                            <span className="text-2xl block mb-2">{val.icon}</span>
                                            <span className="font-semibold text-sm text-gray-800 block">{val.label}</span>
                                            <span className="text-[10px] text-gray-400">{val.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Options */}
                            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
                                <div className="flex items-center gap-2 mb-4">
                                    <Sparkles size={18} className="text-gray-500" />
                                    <h3 className="font-semibold text-gray-800">Seçenekler</h3>
                                </div>
                                <div className="space-y-3">
                                    {audioFiles.length > 0 && (
                                        <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <Volume2 size={16} className="text-gray-500" />
                                                <div>
                                                    <span className="text-sm font-medium text-gray-800">Harici sesi dahil et</span>
                                                    <span className="text-xs text-gray-400 block">{audioFiles.length} mikrofon kaydı</span>
                                                </div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={config.includeAudio}
                                                onChange={e => setConfig(c => ({ ...c, includeAudio: e.target.checked }))}
                                                className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                            />
                                        </label>
                                    )}
                                    {cuts.length > 0 && (
                                        <div className="space-y-2">
                                            <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <FileVideo size={16} className="text-gray-500" />
                                                    <div>
                                                        <span className="text-sm font-medium text-gray-800">Kesimleri uygula</span>
                                                        <span className="text-xs text-gray-400 block">{cuts.length} kesim bölümü çıkarılacak</span>
                                                    </div>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={config.applyCuts}
                                                    onChange={e => setConfig(c => ({ ...c, applyCuts: e.target.checked }))}
                                                    className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                                />
                                            </label>

                                            {config.applyCuts && (
                                                <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors ml-4 border-l-2 border-blue-500">
                                                    <div className="flex items-center gap-3">
                                                        <Sparkles size={16} className="text-gray-500" />
                                                        <div>
                                                            <span className="text-sm font-medium text-gray-800">Yumuşak Geçiş (Crossfade)</span>
                                                            <span className="text-xs text-gray-400 block">Kesimler arasına yumuşak geçiş ekle</span>
                                                        </div>
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        checked={config.transitionType === 'crossfade'}
                                                        onChange={e => setConfig(c => ({ ...c, transitionType: e.target.checked ? 'crossfade' : 'none' }))}
                                                        className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    )}
                                    {/* Loudness Normalization */}
                                    <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <AudioLines size={16} className="text-gray-500" />
                                            <div>
                                                <span className="text-sm font-medium text-gray-800">Ses dengeleme (Loudnorm)</span>
                                                <span className="text-xs text-gray-400 block">Spotify/Netflix standardında ses seviyesi (EBU R128)</span>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={config.normalizeAudio}
                                            onChange={e => setConfig(c => ({ ...c, normalizeAudio: e.target.checked }))}
                                            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* Right: Summary & Export button */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sticky top-6">
                                <h3 className="font-semibold text-gray-800 mb-4">Özet</h3>

                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Kaynak</span>
                                        <span className="font-medium text-gray-800 truncate max-w-[150px]">
                                            {masterVideo?.file.name || '—'} {videoFiles.length > 1 && `(+${videoFiles.length - 1} kamera)`}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Format</span>
                                        <span className="font-medium text-gray-800">{FORMAT_LABELS[config.format].label}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Kalite</span>
                                        <span className="font-medium text-gray-800">{QUALITY_LABELS[config.quality].label}</span>
                                    </div>
                                    {audioFiles.length > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Harici ses</span>
                                            <span className={`font-medium ${config.includeAudio ? 'text-green-600' : 'text-gray-400'}`}>
                                                {config.includeAudio ? `${audioFiles.length} dahil` : 'Hariç'}
                                            </span>
                                        </div>
                                    )}
                                    {cuts.length > 0 && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Kesimler</span>
                                            <span className={`font-medium ${config.applyCuts ? 'text-green-600' : 'text-gray-400'}`}>
                                                {config.applyCuts ? `${cuts.length} bölüm` : 'Uygulanmayacak'}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Ses dengeleme</span>
                                        <span className={`font-medium ${config.normalizeAudio ? 'text-green-600' : 'text-gray-400'}`}>
                                            {config.normalizeAudio ? 'Aktif (EBU R128)' : 'Kapalı'}
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mb-6">
                                    <div className="flex items-center gap-2 text-sm">
                                        <HardDrive size={14} className="text-gray-400" />
                                        <span className="text-gray-500">Tahmini boyut:</span>
                                        <span className="font-semibold text-gray-800">{fmtSize(estimatedSize)}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={handleExport}
                                    disabled={!isLoaded || isFfmpegLoading}
                                    className={`w-full py-4 px-6 font-semibold rounded-xl text-lg transition-all shadow-lg
                                        ${isLoaded
                                            ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-blue-600/30 active:scale-[0.98]'
                                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    <div className="flex items-center justify-center gap-3">
                                        {isFfmpegLoading ? <Loader2 className="animate-spin" size={22} /> : <Download size={22} />}
                                        {isFfmpegLoading ? 'Yükleniyor...' : 'Dışa Aktar'}
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* ── Processing Phase ── */}
            {phase === 'processing' && (
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-10 w-full max-w-lg text-center">
                        <div className="mb-8">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                                <Loader2 size={36} className="text-white animate-spin" />
                            </div>
                        </div>

                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            Video İşleniyor
                        </h3>
                        <p className="text-gray-500 text-sm mb-6">
                            {progressLabel}
                        </p>

                        {/* Progress bar */}
                        <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden mb-3 shadow-inner">
                            <div
                                className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out relative"
                                style={{ width: `${Math.round(progress * 100)}%` }}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                            </div>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>%{Math.round(progress * 100)}</span>
                            <span className="flex items-center gap-1">
                                <Clock size={12} /> {fmtTime(elapsedTime)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Done Phase ── */}
            {phase === 'done' && outputBlob && (
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                    <div className="bg-white rounded-2xl shadow-xl border border-green-100 p-10 w-full max-w-lg text-center">
                        <div className="mb-6">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 shadow-lg shadow-green-100">
                                <Check size={40} className="text-green-600" />
                            </div>
                        </div>

                        <h3 className="text-2xl font-bold text-gray-900 mb-2">
                            Dışa Aktarım Tamamlandı! 🎉
                        </h3>
                        <p className="text-gray-500 text-sm mb-6">
                            Videonuz başarıyla işlendi ve indirilmeye hazır.
                        </p>

                        {/* Video preview */}
                        {outputUrl && (
                            <div className="bg-black rounded-xl overflow-hidden mb-6 aspect-video">
                                <video
                                    src={outputUrl}
                                    className="w-full h-full object-contain"
                                    controls
                                    playsInline
                                />
                            </div>
                        )}

                        {/* File info */}
                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mb-6 text-left">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                    <span className="text-gray-400 block text-xs">Format</span>
                                    <span className="font-medium text-gray-800">{config.format.toUpperCase()}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-xs">Boyut</span>
                                    <span className="font-medium text-gray-800">{fmtSize(outputBlob.size)}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-xs">Kalite</span>
                                    <span className="font-medium text-gray-800">{QUALITY_LABELS[config.quality].label}</span>
                                </div>
                                <div>
                                    <span className="text-gray-400 block text-xs">Süre</span>
                                    <span className="font-medium text-gray-800">{fmtTime(elapsedTime)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <button
                            onClick={handleDownload}
                            className="w-full py-4 px-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl
                                hover:from-green-700 hover:to-emerald-700 shadow-lg shadow-green-600/30
                                active:scale-[0.98] transition-all text-lg mb-3"
                        >
                            <div className="flex items-center justify-center gap-3">
                                <Download size={22} />
                                Videoyu İndir
                            </div>
                        </button>

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setPhase('config'); setOutputBlob(null); }}
                                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm"
                            >
                                Farklı Ayarlarla Dışa Aktar
                            </button>
                            <button
                                onClick={() => setStep(1)}
                                className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium text-sm"
                            >
                                Yeni Proje Başlat
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
