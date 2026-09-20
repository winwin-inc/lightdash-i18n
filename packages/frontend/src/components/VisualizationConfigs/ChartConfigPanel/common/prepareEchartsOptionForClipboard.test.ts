import { describe, expect, it } from 'vitest';
import { prepareEchartsOptionForClipboard } from './prepareEchartsOptionForClipboard';

describe('prepareEchartsOptionForClipboard', () => {
    it('adds datasetId to series when there is a single named dataset', () => {
        const option = {
            dataset: [{ id: 'lightdashResults', source: [{ a: 1 }] }],
            series: [
                { type: 'bar', encode: { x: 'a', y: 'b' } },
                { type: 'line', encode: { x: 'a', y: 'c' } },
            ],
        };

        const result = prepareEchartsOptionForClipboard(option);

        expect(result.series).toEqual([
            {
                type: 'bar',
                encode: { x: 'a', y: 'b' },
                datasetId: 'lightdashResults',
            },
            {
                type: 'line',
                encode: { x: 'a', y: 'c' },
                datasetId: 'lightdashResults',
            },
        ]);
    });

    it('preserves datasetId already set on a series', () => {
        const option = {
            dataset: [{ id: 'lightdashResults', source: [{ a: 1 }] }],
            series: [
                { type: 'bar', datasetId: 'somethingElse' },
                { type: 'line' },
            ],
        };

        const result = prepareEchartsOptionForClipboard(option);
        const patchedSeries = result.series as Array<Record<string, unknown>>;

        expect(patchedSeries[0].datasetId).toBe('somethingElse');
        expect(patchedSeries[1].datasetId).toBe('lightdashResults');
    });

    it('returns option unchanged when there is no dataset', () => {
        const option = { series: [{ type: 'pie' }] };
        expect(prepareEchartsOptionForClipboard(option)).toBe(option);
    });

    it('returns option unchanged when there are multiple datasets', () => {
        const option = {
            dataset: [
                { id: 'a', source: [] },
                { id: 'b', source: [] },
            ],
            series: [{ type: 'bar' }],
        };
        expect(prepareEchartsOptionForClipboard(option)).toBe(option);
    });

    it('returns option unchanged when the only dataset has no id', () => {
        const option = {
            dataset: [{ source: [{ a: 1 }] }],
            series: [{ type: 'bar' }],
        };
        expect(prepareEchartsOptionForClipboard(option)).toBe(option);
    });
});
