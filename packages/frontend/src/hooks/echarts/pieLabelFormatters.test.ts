import { describe, expect, test } from 'vitest';

import {
    applyPieLabelTemplate,
    formatPieSliceLabel,
    wrapLongPieLabel,
} from './pieLabelFormatters';

describe('formatPieSliceLabel', () => {
    test('returns empty string when value label is hidden', () => {
        expect(
            formatPieSliceLabel({
                name: 'Brand A',
                percentValue: 35.3,
                formattedValue: '1,234',
                rawValue: 1234,
                valueLabel: 'hidden',
                showValue: true,
                showPercentage: true,
                useCustomFormat: false,
            }),
        ).toBe('');
    });

    test('formats default percent and value', () => {
        expect(
            formatPieSliceLabel({
                name: 'Brand A',
                percentValue: 35.336,
                formattedValue: '1,234',
                rawValue: 1234,
                valueLabel: 'outside',
                showValue: true,
                showPercentage: true,
                useCustomFormat: false,
            }),
        ).toBe('35.34% - 1,234');
    });

    test('formats percent only', () => {
        expect(
            formatPieSliceLabel({
                name: 'Brand A',
                percentValue: 19.84,
                formattedValue: '999',
                rawValue: 999,
                valueLabel: 'outside',
                showValue: false,
                showPercentage: true,
                useCustomFormat: false,
            }),
        ).toBe('19.84%');
    });

    test('uses custom template', () => {
        expect(
            formatPieSliceLabel({
                name: '农夫山泉',
                percentValue: 35.3,
                formattedValue: '1,234',
                rawValue: 1234,
                valueLabel: 'outside',
                showValue: true,
                showPercentage: true,
                useCustomFormat: true,
                labelTemplate: '{name}, {percent}%',
            }),
        ).toBe('农夫山泉, 35.30%');
    });

    test('falls back to name when only name should show', () => {
        expect(
            formatPieSliceLabel({
                name: 'Brand A',
                percentValue: 10,
                formattedValue: '100',
                rawValue: 100,
                valueLabel: 'outside',
                showValue: false,
                showPercentage: false,
                useCustomFormat: false,
            }),
        ).toBe('Brand A');
    });
});

describe('wrapLongPieLabel', () => {
    test('keeps short comma labels on one line', () => {
        expect(wrapLongPieLabel('农夫山泉, 35.31%')).toBe('农夫山泉, 35.31%');
    });

    test('wraps long comma labels before percentage', () => {
        expect(wrapLongPieLabel('其他品牌—包含199个品牌, 7.67%')).toBe(
            '其他品牌—包含199个品牌,\n7.67%',
        );
    });

    test('wraps long Chinese comma labels before percentage', () => {
        expect(wrapLongPieLabel('其他品牌—包含199个品牌，7.67%')).toBe(
            '其他品牌—包含199个品牌，\n7.67%',
        );
    });

    test('wraps long colon labels after colon', () => {
        expect(wrapLongPieLabel('其他品牌—包含199个品牌: 7.67%')).toBe(
            '其他品牌—包含199个品牌:\n7.67%',
        );
    });

    test('wraps at separator for long labels', () => {
        expect(
            wrapLongPieLabel('35.34% - Very long brand name here'),
        ).toContain('\n');
    });

    test('leaves short labels unchanged', () => {
        expect(wrapLongPieLabel('19.84%')).toBe('19.84%');
    });
});

describe('applyPieLabelTemplate', () => {
    test('supports long Chinese brand names without truncation', () => {
        const label = applyPieLabelTemplate(
            '{name}, {percent}%',
            {
                name: '其他品牌—包含多个子品牌',
                percentValue: 14.8,
                formattedValue: '500',
                rawValue: 500,
            },
            2,
        );

        expect(label).toBe('其他品牌—包含多个子品牌, 14.80%');
    });
});
