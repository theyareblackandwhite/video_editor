/**
 * SyncHarness Logic
 * Provides lightweight utilities to simulate and validate audio synchronization scenarios
 * without the need for raw audio buffers.
 * .antigravity standard: Performance-first, no heavy dependencies in test path.
 */

export interface SyntheticSignal {
    data: Float32Array;
    sampleRate: number;
    peaks: number[]; // Indices of simulated transients
}

/**
 * Generates a synthetic signal with specific transient peaks.
 * Useful for testing correlation without real audio data.
 */
export const createSyntheticSignal = (
    length: number,
    sampleRate: number,
    peaks: number[],
    noiseLevel: number = 0.01
): SyntheticSignal => {
    const data = new Float32Array(length);
    
    // Add background noise
    for (let i = 0; i < length; i++) {
        data[i] = (Math.random() - 0.5) * noiseLevel;
    }

    // Add spikes at peak locations
    for (const peak of peaks) {
        if (peak >= 0 && peak < length) {
            // Simulated transient: sharp rise and decay
            data[peak] = 1.0;
            if (peak + 1 < length) data[peak + 1] = 0.5;
            if (peak + 2 < length) data[peak + 2] = 0.25;
            if (peak - 1 >= 0) data[peak - 1] = 0.5;
        }
    }

    return { data, sampleRate, peaks };
};

/**
 * Validates if the bestLag found by the sync logic aligns with the ground truth.
 */
export const validateCorrelationResult = (
    expectedShift: number,
    detectedLag: number,
    tolerance: number = 2
): { isValid: boolean; error: number } => {
    const error = Math.abs(detectedLag - expectedShift);
    return {
        isValid: error <= tolerance,
        error
    };
};
