import type { StateCreator, StoreMutatorIdentifier } from 'zustand';
import type { ProjectState } from '../types';

/**
 * StateValidator Middleware
 * Inspects the Zustand store after every action to ensure data consistency.
 * .antigravity standard: Fail fast, maintain data integrity.
 */

type StateValidator = <
  T extends { state: ProjectState },
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  initializer: StateCreator<T, Mps, Mcs>
) => StateCreator<T, Mps, Mcs>;

export const stateValidator: StateValidator = (config) => (set, get, api) =>
  config(
    ((...args: any[]) => {
      (set as any)(...args);
      const newState = get() as { state: ProjectState };
      validateConsistency(newState.state);
    }) as typeof set,
    get,
    api
  );

/**
 * Deep validation of ProjectState.
 * Throws or logs warnings if consistency is breached.
 */
function validateConsistency(state: ProjectState) {
    const errors: string[] = [];

    // Rule 1: Step bounds
    if (state.currentStep < 1 || state.currentStep > 5) {
        errors.push(`Invalid currentStep: ${state.currentStep}. Must be between 1 and 5.`);
    }

    // Rule 2: ID uniqueness for video files
    const videoIds = new Set(state.videoFiles.map(f => f.id));
    if (videoIds.size !== state.videoFiles.length) {
        errors.push(`Duplicate video file IDs detected.`);
    }

    // Rule 3: Cuts must have valid start/end
    state.cuts.forEach((cut, idx) => {
        if (cut.start >= cut.end) {
            errors.push(`Invalid cut at index ${idx}: start (${cut.start}) must be less than end (${cut.end}).`);
        }
    });

    // Rule 4: Layout mode performance hint
    if (state.videoFiles.length > 4) {
        console.warn(`Performance warning: Processing ${state.videoFiles.length} files might be slow.`);
    }

    if (errors.length > 0) {
        console.error('State Consistency Failure:', errors.join('\n'));
    }
}
