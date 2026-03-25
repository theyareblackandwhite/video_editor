/**
 * FFmpegAudit Harness
 * Detailed logging of FFmpeg command sequences and timings.
 * .antigravity standard: Application Legibility & Performance Tracking.
 */

export interface AuditEntry {
    timestamp: number;
    command: string[];
    durationMs?: number;
    status: 'success' | 'failure';
    error?: string;
}

class FFmpegAuditor {
    private logs: AuditEntry[] = [];

    /**
     * Records a command execution and its outcome.
     */
    record(entry: AuditEntry) {
        this.logs.push(entry);
        this.logToAgent(entry);
    }

    /**
     * Dumps all logs for agent analysis.
     */
    getLogs(): AuditEntry[] {
        return this.logs;
    }

    private logToAgent(entry: AuditEntry) {
        console.warn(`--- AGENT_HARNESS: FFMPEG_AUDIT [${entry.status.toUpperCase()}] ---`);
        console.warn(`Command: ffmpeg ${entry.command.join(' ')}`);
        if (entry.durationMs) console.warn(`Duration: ${entry.durationMs}ms`);
        if (entry.error) console.warn(`Error: ${entry.error}`);
        console.warn('--- END_AUDIT ---');
    }
}

/**
 * Singleton instance for project-wide auditing.
 */
export const ffmpegAudit = new FFmpegAuditor();
