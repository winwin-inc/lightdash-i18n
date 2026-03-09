import {
    HEATMAP_FIELD_IDS,
    BRAND_FIELD_IDS,
} from '@/lib/heatmapFilters';
import { executeMetricQuery, fetchQueryResults } from '@/lib/lightdash';
import { NextRequest, NextResponse } from 'next/server';

const EXPLORE_GROUP = 'ads_province_heatmap_sales_group_top_m';
const EXPLORE_BRAND = 'ads_province_heatmap_sales_brand_top_m';

type Row = Record<string, { value?: { raw?: unknown; formatted?: unknown } }>;

function uniqueSorted(values: string[]): string[] {
    const set = new Set(values.filter((s) => s != null && String(s).trim() !== ''));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function extractUnique(rows: Row[], fieldId: string): string[] {
    const values: string[] = [];
    for (const row of rows) {
        const cell = row[fieldId];
        const raw = cell?.value?.raw;
        const formatted = cell?.value?.formatted;
        const v = formatted != null ? String(formatted) : raw != null ? String(raw) : '';
        if (v.trim() !== '') values.push(v.trim());
    }
    return uniqueSorted(values);
}

export type FilterOptionsResponse = {
    bizDate: string[];
    cls2: string[];
    cls3: string[];
    cls4: string[];
    /** 集团名或品牌名（按 entityType 二选一） */
    entityNames: string[];
};

/**
 * GET /api/heatmap/filter-options?projectUuid=xxx&entityType=group|brand
 * 返回类目、月份等筛选项的可选值（从 explore 查询去重得到）。
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const projectUuid = searchParams.get('projectUuid');
    const entityType = searchParams.get('entityType') === 'brand' ? 'brand' : 'group';

    if (!projectUuid || !projectUuid.trim()) {
        return NextResponse.json(
            { error: 'projectUuid is required' },
            { status: 400 },
        );
    }

    const ids = entityType === 'brand' ? BRAND_FIELD_IDS : HEATMAP_FIELD_IDS;
    const exploreName = entityType === 'brand' ? EXPLORE_BRAND : EXPLORE_GROUP;

    const entityFieldId =
        entityType === 'brand'
            ? BRAND_FIELD_IDS.brandName
            : HEATMAP_FIELD_IDS.groupName;

    try {
        const { queryUuid } = await executeMetricQuery(projectUuid, {
            query: {
                exploreName,
                dimensions: [ids.bizDate, ids.cls2, ids.cls3, ids.cls4, entityFieldId],
                metrics: [ids.totalMarketShare],
                filters: {},
                sorts: [],
                limit: 3000,
                tableCalculations: [],
            },
        });
        const { rows } = await fetchQueryResults(projectUuid, queryUuid);
        const list = (rows ?? []) as Row[];

        const bizDate = extractUnique(list, ids.bizDate);
        const cls2 = extractUnique(list, ids.cls2);
        const cls3 = extractUnique(list, ids.cls3);
        const cls4 = extractUnique(list, ids.cls4);
        const entityNames = extractUnique(list, entityFieldId);

        const body: FilterOptionsResponse = {
            bizDate,
            cls2,
            cls3,
            cls4,
            entityNames,
        };
        return NextResponse.json(body);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
