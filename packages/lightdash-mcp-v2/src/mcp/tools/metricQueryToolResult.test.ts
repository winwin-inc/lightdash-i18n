import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildMetricQueryToolResult } from './metricQueryToolResult';

describe('buildMetricQueryToolResult', () => {
    const rows = [
        {
            share: {
                value: { raw: 0.0817654321, formatted: '8.2%' },
            },
        },
    ];
    const executeResult = {
        fields: {
            share: { label: '市场份额', name: 'share' },
        },
        warnings: [],
    } as never;

    it('full=false returns flat rows with valueFormat raw', () => {
        const result = buildMetricQueryToolResult({
            queryUuid: 'q-1',
            rows,
            columns: ['share'],
            executeResult,
            full: false,
            valueFormat: 'raw',
        });
        assert.equal(result.content.length, 1);
        assert.match(String(result.content[0]?.text), /0\.0817654321/);
        const sc = result.structuredContent as Record<string, unknown>;
        assert.equal(sc.valueFormat, 'raw');
        assert.deepEqual((sc.rows as Record<string, unknown>[])[0], {
            share: 0.0817654321,
        });
        assert.equal(sc.fields, undefined);
    });

    it('full=false with valueFormat formatted uses display values in CSV', () => {
        const result = buildMetricQueryToolResult({
            queryUuid: 'q-1',
            rows,
            columns: ['share'],
            executeResult,
            full: false,
            valueFormat: 'formatted',
        });
        assert.match(String(result.content[0]?.text), /8\.2%/);
    });

    it('full=true returns nested rows, fields, and second JSON content block', () => {
        const result = buildMetricQueryToolResult({
            queryUuid: 'q-1',
            rows,
            columns: ['share'],
            executeResult,
            full: true,
            valueFormat: 'raw',
        });
        assert.equal(result.content.length, 2);
        const sc = result.structuredContent as Record<string, unknown>;
        assert.ok(Array.isArray(sc.rows));
        assert.ok(sc.fields);
        assert.equal(sc.valueFormat, undefined);
        assert.equal(
            JSON.parse(String(result.content[1]?.text)).queryUuid,
            'q-1',
        );
    });
});
