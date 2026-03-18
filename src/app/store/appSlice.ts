import type { StateCreator } from 'zustand';
import type { AppState } from './index';

export interface AppSlice {
    currentStep: number;
    setStep: (step: number) => void;
}

export const createAppSlice: StateCreator<AppState, [], [], AppSlice> = (set) => ({
    currentStep: 1,
    setStep: (step) => set({ currentStep: step }),
});
