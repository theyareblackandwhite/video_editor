import { renderHook, act } from '@testing-library/react';
import { useFilePicker } from '../useFilePicker';
import { open } from '@tauri-apps/plugin-dialog';
import { stat } from '@tauri-apps/plugin-fs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mocks are handled in setup.ts, but we redeclare here for type safety and clarity
vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
    stat: vi.fn(),
}));

describe('useFilePicker hook', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns null and sets no error when user cancels selection', async () => {
        vi.mocked(open).mockResolvedValue(null);
        
        const { result } = renderHook(() => useFilePicker({ 
            accept: { 'video': ['.mp4'] }, 
            type: 'video' 
        }));

        let picked;
        await act(async () => {
            picked = await result.current.pickFile();
        });

        expect(picked).toBeNull();
        expect(result.current.error).toBeNull();
        expect(result.current.isLoading).toBe(false);
    });

    it('successfully picks and validates a valid video file', async () => {
        const mockPath = '/Users/test/video.mp4';
        vi.mocked(open).mockResolvedValue(mockPath);
        vi.mocked(stat).mockResolvedValue({ size: 500 * 1024 * 1024 } as any);

        const { result } = renderHook(() => useFilePicker({ 
            accept: { 'video': ['.mp4'] }, 
            type: 'video' 
        }));

        let picked;
        await act(async () => {
            picked = await result.current.pickFile();
        });

        expect(picked).toEqual({
            path: mockPath,
            name: 'video.mp4',
            size: 500 * 1024 * 1024,
            type: 'video/mp4'
        });
        expect(result.current.error).toBeNull();
        expect(result.current.warning).toBeNull();
    });

    it('sets error and returns null when file size exceeds hard limit', async () => {
        const mockPath = '/Users/test/huge_movie.mp4';
        vi.mocked(open).mockResolvedValue(mockPath);
        // Over 2GB limit for video
        vi.mocked(stat).mockResolvedValue({ size: 2500 * 1024 * 1024 } as any);

        const { result } = renderHook(() => useFilePicker({ 
            accept: { 'video': ['.mp4'] }, 
            type: 'video' 
        }));

        let picked;
        await act(async () => {
            picked = await result.current.pickFile();
        });

        expect(picked).toBeNull();
        expect(result.current.error).toBeTruthy();
        expect(typeof result.current.error).toBe('string');
    });

    it('sets warning when file size exceeds soft limit (warning threshold)', async () => {
        const mockPath = '/Users/test/large_video.mp4';
        vi.mocked(open).mockResolvedValue(mockPath);
        // Between 1GB and 2GB for video
        vi.mocked(stat).mockResolvedValue({ size: 1500 * 1024 * 1024 } as any);

        const { result } = renderHook(() => useFilePicker({ 
            accept: { 'video': ['.mp4'] }, 
            type: 'video' 
        }));

        let picked;
        await act(async () => {
            picked = await result.current.pickFile();
        });

        expect(picked).not.toBeNull();
        expect(result.current.warning).toBeTruthy();
        expect(result.current.error).toBeNull();
    });

    it('handles unexpected errors during file selection', async () => {
        vi.mocked(open).mockRejectedValue(new Error('Permission denied'));

        const { result } = renderHook(() => useFilePicker({ 
            accept: { 'video': ['.mp4'] }, 
            type: 'video' 
        }));

        let picked;
        await act(async () => {
            picked = await result.current.pickFile();
        });

        expect(picked).toBeNull();
        expect(result.current.error).toBe('Permission denied');
    });
});
