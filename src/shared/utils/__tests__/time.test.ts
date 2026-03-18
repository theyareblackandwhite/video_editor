import { describe, it, expect } from 'vitest';
import { formatTime } from '../time';

describe('formatTime', () => {
    it('formats 0 seconds as "0:00"', () => {
        expect(formatTime(0)).toBe('0:00');
    });

    it('formats 5 seconds as "0:05"', () => {
        expect(formatTime(5)).toBe('0:05');
    });

    it('formats 65 seconds as "1:05"', () => {
        expect(formatTime(65)).toBe('1:05');
    });

    it('formats 3661 seconds as "61:01"', () => {
        expect(formatTime(3661)).toBe('61:01');
    });

    it('floors fractional seconds', () => {
        expect(formatTime(5.9)).toBe('0:05');
        expect(formatTime(59.99)).toBe('0:59');
    });

    it('pads single-digit seconds with leading zero', () => {
        expect(formatTime(3)).toBe('0:03');
        expect(formatTime(60)).toBe('1:00');
    });
});
