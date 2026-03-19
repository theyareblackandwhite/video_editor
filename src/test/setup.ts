import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri plugins
vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
    stat: vi.fn(),
}));
