/**
 * FFmpegMockHarness
 * A lightweight replacement for @ffmpeg/ffmpeg in tests.
 * Validates CLI arguments and simulates file system state.
 * .antigravity standard: Do not run heavy WASM in CI, validate intent instead.
 */

export interface VirtualFile {
    name: string;
    data: Uint8Array | string;
}

export class FFmpegMock {
    public fs: Map<string, VirtualFile> = new Map();
    public lastCommand: string[] = [];
    public isLoaded: boolean = false;

    async load() {
        this.isLoaded = true;
        return Promise.resolve();
    }

    async writeFile(name: string, data: Uint8Array | string) {
        this.fs.set(name, { name, data });
        return Promise.resolve();
    }

    async readFile(name: string) {
        const file = this.fs.get(name);
        if (!file) throw new Error(`File not found in mock FS: ${name}`);
        return Promise.resolve(file.data);
    }

    async deleteFile(name: string) {
        this.fs.delete(name);
        return Promise.resolve();
    }

    async exec(args: string[]) {
        this.lastCommand = args;
        // Basic validation: ensure input files exist
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '-i' && i + 1 < args.length) {
                const inputName = args[i + 1];
                if (!this.fs.has(inputName)) {
                    throw new Error(`FFmpeg error: Input file '${inputName}' not found in virtual FS.`);
                }
            }
        }
        return Promise.resolve(0); // Exit code 0
    }

    /**
     * Helper for tests to verify if the correct filters were applied.
     */
    hasFilter(filterFragment: string): boolean {
        const fullCmd = this.lastCommand.join(' ');
        return fullCmd.includes(filterFragment);
    }
}

/**
 * Global harness to replace FFmpeg imports in tests.
 */
export const createFFmpegHarness = () => new FFmpegMock();
