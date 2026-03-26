import type { StateCreator, StoreMutatorIdentifier } from 'zustand';

/**
 * StateValidator Middleware
 * Inspects the Zustand store after every action to ensure data consistency.
 * .antigravity standard: Fail fast, maintain data integrity.
 */

type StateValidator = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  initializer: StateCreator<T, Mps, Mcs>
) => StateCreator<T, Mps, Mcs>;

export const stateValidator: StateValidator = (config) => (set, get, api) =>
  config(
    ((...args: any[]) => {
      (set as any)(...args);
      const newState = get();
      validateConsistency(newState);
    }) as typeof set,
    get,
    api
  );

/**
 * Deep validation of store state.
 * Throws or logs warnings if consistency is breached.
 */
export function validateConsistency(state: any) {
    const errors: string[] = [];

    // Rule 1: Step bounds (if currentStep exists)
    if (state.currentStep !== undefined && (state.currentStep < 1 || state.currentStep > 5)) {
        errors.push(`Invalid currentStep: ${state.currentStep}. Must be between 1 and 5.`);
    }

    // Rule 2: ID uniqueness for video files (if videoFiles exists)
    if (Array.isArray(state.videoFiles)) {
        const videoIds = new Set(state.videoFiles.map((f: any) => f.id));
        if (videoIds.size !== state.videoFiles.length) {
            errors.push(`Duplicate video file IDs detected.`);
        }
    }

    // Rule 3: Cuts must have valid start/end (if cuts exists)
    if (Array.isArray(state.cuts)) {
        state.cuts.forEach((cut: any, idx: number) => {
            if (cut.start >= cut.end) {
                errors.push(`Invalid cut at index ${idx}: start (${cut.start}) must be less than end (${cut.end}).`);
            }
        });
    }

    // Rule 4: Layout mode performance hint
    if (Array.isArray(state.videoFiles) && state.videoFiles.length > 4) {
        console.warn(`Performance warning: Processing ${state.videoFiles.length} files might be slow.`);
    }

    if (errors.length > 0) {
        console.error('State Consistency Failure:', errors.join('\n'));
    }
}
