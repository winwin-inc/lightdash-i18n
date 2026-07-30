import { describe, expect, it } from 'vitest';

import {
    computeExportDimensions,
    ExportAspectRatio,
    getExportFileBaseName,
    sanitizeFileName,
} from './chartDownloadUtils';

describe('computeExportDimensions', () => {
    it('16:9 source into 16:9 target fills exactly without letterboxing', () => {
        const dims = computeExportDimensions(
            1920,
            1080,
            ExportAspectRatio.A16x9,
        );
        expect(dims.targetW).toBe(1920);
        expect(dims.targetH).toBe(1080);
        expect(dims.drawW).toBe(1920);
        expect(dims.drawH).toBe(1080);
        expect(dims.offsetX).toBe(0);
        expect(dims.offsetY).toBe(0);
    });

    it('16:9 source into 9:16 target letterboxes top and bottom', () => {
        const dims = computeExportDimensions(
            1920,
            1080,
            ExportAspectRatio.A9x16,
        );
        expect(dims.targetW).toBe(1080);
        expect(dims.targetH).toBe(1920);
        expect(dims.drawW).toBe(1080);
        // 1080 / (16/9) = 607.5 → 608
        expect(dims.drawH).toBe(608);
        expect(dims.offsetX).toBe(0);
        expect(dims.offsetY).toBeGreaterThan(0);
    });

    it('1:1 source into 16:9 target letterboxes left and right', () => {
        const dims = computeExportDimensions(
            1000,
            1000,
            ExportAspectRatio.A16x9,
        );
        expect(dims.targetW).toBe(1920);
        expect(dims.targetH).toBe(1080);
        expect(dims.drawH).toBe(1080);
        expect(dims.drawW).toBe(1080);
        expect(dims.offsetY).toBe(0);
        expect(dims.offsetX).toBeGreaterThan(0);
    });

    it('1:1 source into 9:16 target letterboxes top and bottom', () => {
        const dims = computeExportDimensions(
            1000,
            1000,
            ExportAspectRatio.A9x16,
        );
        expect(dims.targetW).toBe(1080);
        expect(dims.targetH).toBe(1920);
        expect(dims.drawW).toBe(1080);
        expect(dims.drawH).toBe(1080);
        expect(dims.offsetX).toBe(0);
        expect(dims.offsetY).toBeGreaterThan(0);
    });

    it('ORIGINAL preserves source dimensions', () => {
        const dims = computeExportDimensions(
            1600,
            900,
            ExportAspectRatio.ORIGINAL,
        );
        expect(dims.targetW).toBe(1600);
        expect(dims.targetH).toBe(900);
        expect(dims.drawW).toBe(1600);
        expect(dims.drawH).toBe(900);
    });

    it('handles missing source dimensions safely (falls back to 1:1)', () => {
        const dims = computeExportDimensions(0, 0, ExportAspectRatio.A16x9);
        expect(dims.targetW).toBe(1920);
        expect(dims.targetH).toBe(1080);
        expect(dims.drawH).toBe(1080);
        expect(dims.drawW).toBe(1080);
    });

    it('draw rectangle is always centered (offsets × 2 equals padding)', () => {
        const dims = computeExportDimensions(
            1000,
            1000,
            ExportAspectRatio.A16x9,
        );
        const horizontalPad = dims.targetW - dims.drawW;
        const verticalPad = dims.targetH - dims.drawH;
        expect(dims.offsetX * 2).toBe(horizontalPad);
        expect(dims.offsetY * 2).toBe(verticalPad);
    });
});

describe('getExportFileBaseName', () => {
    it('uses chartName when provided with ORIGINAL', () => {
        expect(
            getExportFileBaseName(ExportAspectRatio.ORIGINAL, '品类占比'),
        ).toBe('品类占比_白色');
    });

    it('appends _16x9 suffix for 16:9 ratio', () => {
        expect(
            getExportFileBaseName(ExportAspectRatio.A16x9, '品类占比'),
        ).toBe('品类占比_16x9_白色');
    });

    it('appends _9x16 suffix for 9:16 ratio', () => {
        expect(
            getExportFileBaseName(ExportAspectRatio.A9x16, '品类占比'),
        ).toBe('品类占比_9x16_白色');
    });

    it('uses _透明色 suffix when transparent background', () => {
        expect(
            getExportFileBaseName(
                ExportAspectRatio.A16x9,
                '品类占比',
                true,
            ),
        ).toBe('品类占比_16x9_透明色');
    });

    it('falls back to default name when no chartName provided', () => {
        expect(
            getExportFileBaseName(
                ExportAspectRatio.A16x9,
                undefined,
                false,
            ),
        ).toBe('lightdash_chart_16x9_白色');
    });

    it('sanitizes illegal characters from chartName', () => {
        expect(
            getExportFileBaseName(
                ExportAspectRatio.ORIGINAL,
                'name/with?bad:chars',
            ),
        ).toBe('name_with_bad_chars_白色');
    });
});

describe('sanitizeFileName', () => {
    it('replaces path separators with underscores', () => {
        expect(sanitizeFileName('a/b\\c')).toBe('a_b_c');
    });

    it('replaces characters illegal on Windows', () => {
        expect(sanitizeFileName('a?b%c*d|e')).toBe('a_b_c_d_e');
    });

    it('returns default when input is empty after trim', () => {
        expect(sanitizeFileName('   ')).toBe('lightdash_chart');
    });

    it('preserves valid characters', () => {
        expect(sanitizeFileName('品类-占比_2024')).toBe('品类-占比_2024');
    });
});