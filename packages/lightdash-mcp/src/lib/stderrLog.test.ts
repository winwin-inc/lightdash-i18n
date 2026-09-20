import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatLocalTimestamp } from './stderrLog';

describe('formatLocalTimestamp', () => {
    it('formats as [YYYY-MM-DD HH:mm:ss.SSS] in local time', () => {
        const date = new Date(2026, 2, 14, 20, 12, 34, 789);
        assert.equal(formatLocalTimestamp(date), '[2026-03-14 20:12:34.789]');
    });

    it('zero-pads single-digit fields and milliseconds', () => {
        const date = new Date(2026, 0, 5, 1, 2, 3, 4);
        assert.equal(formatLocalTimestamp(date), '[2026-01-05 01:02:03.004]');
    });
});
