import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION } from '../toolDescriptions/runSemanticMetricQuery';
import { RUN_METRIC_QUERY_FLAT_DESCRIPTION } from '../toolDescriptions/runMetricQueryFlat';
import {
    assertNoFlatMetricQueryArgs,
    assertNoSemanticMetricQueryArgs,
    metricQueryInputSchema,
    omitEmptyOptionalMetricQueryFields,
    prepareSemanticMetricQueryBody,
} from './metricQueryPassthrough';

export const BRAND_CLS4_METRIC_QUERY_FIXTURE = {
    exploreName: 'brand_cls4_insight_list',
    dimensions: ['brand_cls4_insight_list_brand_name'],
    metrics: ['brand_cls4_insight_list_total_brand_growth_cls_4'],
    filters: {
        dimensions: {
            id: '73364a83-eeae-4dff-bf44-5aeebc6b124b',
            and: [
                {
                    id: 'f6a6cb30-b620-4ebe-ac57-42c63934eecc',
                    target: { fieldId: 'brand_cls4_insight_list_brand_name' },
                    values: ['其他品牌'],
                    operator: 'notEquals',
                    required: false,
                },
                {
                    id: '1865bbc6-8979-41fa-8475-36967842c082',
                    target: { fieldId: 'brand_cls4_insight_list_cls_4' },
                    operator: 'equals',
                    values: ['非冷藏即饮果汁'],
                    required: false,
                },
                {
                    id: 'c10ebcb8-7839-44a1-b56a-1bd077cdb410',
                    target: { fieldId: 'brand_cls4_insight_list_period' },
                    operator: 'equals',
                    values: ['2026Q1'],
                    required: false,
                },
            ],
        },
    },
    sorts: [
        {
            fieldId: 'brand_cls4_insight_list_total_brand_growth_cls_4',
            descending: true,
        },
    ],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
    customDimensions: [],
    metricOverrides: {},
} as const;

describe('omitEmptyOptionalMetricQueryFields', () => {
    it('removes empty arrays and metricOverrides object', () => {
        const out = omitEmptyOptionalMetricQueryFields({
            exploreName: 'x',
            tableCalculations: [],
            additionalMetrics: [],
            customDimensions: [],
            metricOverrides: {},
            dimensions: ['a'],
            metrics: ['b'],
        });
        assert.equal('tableCalculations' in out, false);
        assert.equal('additionalMetrics' in out, false);
        assert.equal('metricOverrides' in out, false);
        assert.deepEqual(out.dimensions, ['a']);
    });
});

describe('prepareSemanticMetricQueryBody', () => {
    it('preserves Explorer filters.and for brand_cls4 fixture', () => {
        const body = prepareSemanticMetricQueryBody(
            JSON.stringify({ ...BRAND_CLS4_METRIC_QUERY_FIXTURE }),
            undefined,
        );
        const dimensions = body.filters as {
            dimensions?: { and?: unknown[] };
        };
        assert.equal(body.exploreName, 'brand_cls4_insight_list');
        assert.equal(dimensions.dimensions?.and?.length, 3);
        const cls4 = dimensions.dimensions?.and?.[1] as {
            values?: string[];
        };
        assert.deepEqual(cls4.values, ['非冷藏即饮果汁']);
        assert.equal('additionalMetrics' in body, false);
    });

    it('applies limit override at top level', () => {
        const body = prepareSemanticMetricQueryBody(
            JSON.stringify({
                exploreName: 'orders',
                dimensions: [],
                metrics: [],
                limit: 10,
            }),
            200,
        );
        assert.equal(body.limit, 200);
    });

    it('parses Explorer JSON string like run_sql sql', () => {
        const body = prepareSemanticMetricQueryBody(
            JSON.stringify({
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_unique_order_count'],
                filters: {},
                limit: 50,
            }),
            undefined,
        );
        assert.equal(body.exploreName, 'orders');
        assert.deepEqual(body.dimensions, ['orders_status']);
        assert.equal(body.limit, 50);
    });
});

describe('assertNoFlatMetricQueryArgs', () => {
    it('throws when flat fields present', () => {
        assert.throws(
            () =>
                assertNoFlatMetricQueryArgs({
                    metricQuery: '{}',
                    exploreName: 'x',
                }),
            /请勿传扁平字段/,
        );
    });
});

describe('assertNoSemanticMetricQueryArgs', () => {
    it('rejects metricQuery on flat tool', () => {
        assert.throws(
            () => assertNoSemanticMetricQueryArgs({ metricQuery: '{}' }),
            /run_semantic_metric_query/,
        );
    });
});

describe('metricQueryInputSchema', () => {
    it('accepts JSON string', () => {
        assert.equal(
            metricQueryInputSchema.safeParse('{"exploreName":"x"}').success,
            true,
        );
        assert.equal(metricQueryInputSchema.safeParse('').success, false);
        assert.equal(metricQueryInputSchema.safeParse([]).success, false);
    });

    it('coerces object input to JSON string via preprocess', () => {
        const result = metricQueryInputSchema.safeParse({ exploreName: 'x' });
        assert.equal(result.success, true);
        if (result.success) {
            assert.equal(result.data, '{"exploreName":"x"}');
        }
    });
});

describe('tool descriptions', () => {
    it('semantic description has rules and JSON string guidance', () => {
        assert.match(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /强制规则/);
        assert.match(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /metricQuery/);
        assert.match(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /JSON 字符串/);
        assert.match(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /run_sql/);
        assert.match(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /filter is not a function/);
        assert.doesNotMatch(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /也可：object/);
        assert.doesNotMatch(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /docs\/mcp/);
        assert.doesNotMatch(RUN_SEMANTIC_METRIC_QUERY_DESCRIPTION, /详见/);
    });

    it('flat description forbids metricQuery and points to semantic tool', () => {
        assert.doesNotMatch(RUN_METRIC_QUERY_FLAT_DESCRIPTION, /废弃/);
        assert.match(RUN_METRIC_QUERY_FLAT_DESCRIPTION, /强制规则/);
        assert.match(RUN_METRIC_QUERY_FLAT_DESCRIPTION, /禁止传 metricQuery/);
        assert.match(RUN_METRIC_QUERY_FLAT_DESCRIPTION, /run_semantic_metric_query/);
        assert.doesNotMatch(RUN_METRIC_QUERY_FLAT_DESCRIPTION, /docs\/mcp/);
        assert.doesNotMatch(RUN_METRIC_QUERY_FLAT_DESCRIPTION, /详见/);
    });
});
