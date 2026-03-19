import { describe, it, expect } from 'vitest';
import { cn } from '../cn';

describe('cn utility', () => {
    it('merges multiple class strings', () => {
        expect(cn('btn', 'btn-primary')).toBe('btn btn-primary');
    });

    it('handles conditional classes', () => {
        expect(cn('btn', true && 'btn-active', false && 'btn-disabled')).toBe('btn btn-active');
    });

    it('handles object notation', () => {
        expect(cn({ 'btn-active': true, 'btn-disabled': false })).toBe('btn-active');
    });

    it('merges tailwind classes (tailwind-merge)', () => {
        // px-2 and px-4 should merge to px-4
        expect(cn('px-2', 'px-4')).toBe('px-4');
    });

    it('handles complex merging with overrides', () => {
        expect(cn('bg-red-500 text-white p-4', 'bg-blue-600')).toBe('text-white p-4 bg-blue-600');
    });

    it('handles empty or undefined inputs', () => {
        expect(cn('', undefined, null, false)).toBe('');
    });
});
