import {
    toolRunMetricQueryArgsSchemaTransformed,
    toolSearchFieldValuesArgsSchemaTransformed,
} from '@lightdash/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { McpToolName } from './McpToolName';
import { withToolDiscriminator } from './mcpToolArgs';

/**
 * 回归测试：MCP handler 透传给共享 AI 工具实现时，必须补回被
 * `getMcpCompatibleSchema()` 剥掉的 `type` 判别键。
 *
 * 入参形状照 MCP 实际交给 handler 的 parsed args：
 * - 不含 `type`（被 schema 剥离）
 * - nullable 字段已由 McpSchemaCompatLayer 补成 `null`
 */
const parsedRunMetricQueryArgs = {
    vizConfig: {
        exploreName: 'pinleibaohsm_cls_top',
        metrics: ['pinleibaohsm_cls_top_total_cls4_amount'],
        dimensions: [],
        sorts: [],
        limit: 10,
    },
    customMetrics: null,
    tableCalculations: null,
    filters: null,
    projectUuid: '3667f682-4080-44a4-8365-49f405936e09',
};

const parsedSearchFieldValuesArgs = {
    table: 'pinleibaohsm_cls_top',
    fieldId: 'pinleibaohsm_cls_top_period',
    query: null,
    filters: null,
    projectUuid: '3667f682-4080-44a4-8365-49f405936e09',
};

describe('MCP 工具判别键（type）', () => {
    it('MCP 工具名与 AI schema 的 type 字面量一致', () => {
        expect(McpToolName.RUN_METRIC_QUERY).toBe('run_metric_query');
        expect(McpToolName.SEARCH_FIELD_VALUES).toBe('search_field_values');
    });

    it('run_metric_query：缺少 type 的 MCP 入参会被共享实现拒绝', () => {
        const result = toolRunMetricQueryArgsSchemaTransformed.safeParse({
            ...parsedRunMetricQueryArgs,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        code: 'invalid_literal',
                        path: ['type'],
                    }),
                ]),
            );
        }
    });

    it('run_metric_query：补回 type 后可正常解析（含 nullable 补 null）', () => {
        const result = toolRunMetricQueryArgsSchemaTransformed.safeParse(
            withToolDiscriminator(
                parsedRunMetricQueryArgs,
                McpToolName.RUN_METRIC_QUERY,
            ),
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.type).toBe('run_metric_query');
            expect(result.data.customMetrics).toEqual([]);
            // filtersSchemaTransformed 把 null 归一成三维 and 组（各带随机 id）
            expect(result.data.filters.metrics).toMatchObject({ and: [] });
            expect(result.data.filters.dimensions).toMatchObject({ and: [] });
        }
    });

    it('search_field_values：缺少 type 的 MCP 入参会被共享实现拒绝', () => {
        const result = toolSearchFieldValuesArgsSchemaTransformed.safeParse({
            ...parsedSearchFieldValuesArgs,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        code: 'invalid_literal',
                        path: ['type'],
                    }),
                ]),
            );
        }
    });

    it('search_field_values：补回 type 后可正常解析', () => {
        const result = toolSearchFieldValuesArgsSchemaTransformed.safeParse(
            withToolDiscriminator(
                parsedSearchFieldValuesArgs,
                McpToolName.SEARCH_FIELD_VALUES,
            ),
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.type).toBe('search_field_values');
            expect(result.data.table).toBe('pinleibaohsm_cls_top');
        }
    });

    it('withToolDiscriminator 不修改入参对象', () => {
        const original = { ...parsedSearchFieldValuesArgs };
        const next = withToolDiscriminator(
            original,
            McpToolName.SEARCH_FIELD_VALUES,
        );

        expect(original).not.toHaveProperty('type');
        expect(next).not.toBe(original);
        expect(next.type).toBe('search_field_values');
    });

    /**
     * 源码级守门：这两个调用点必须走 withToolDiscriminator，
     * 否则共享实现会因缺少 `type` 而报 invalid_literal。
     */
    it('McpService 把入参透传给共享实现时补回了 type', () => {
        const source = readFileSync(
            path.join(__dirname, 'McpService.ts'),
            'utf8',
        );
        const assertCallSiteUsesDiscriminator = (callee: string) => {
            const index = source.indexOf(`await ${callee}(`);
            expect(index).toBeGreaterThan(-1);
            // 取调用点后 600 字符，足够包裹 deps 对象与 args 实参
            const callSite = source.slice(index, index + 600);
            expect(callSite).toContain('withToolDiscriminator(');
        };

        assertCallSiteUsesDiscriminator('runRunMetricQuery');
        assertCallSiteUsesDiscriminator('runSearchFieldValues');
    });
});
