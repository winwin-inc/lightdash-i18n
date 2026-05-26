import type { ResultRow } from '@/lib/echartsOption';
import {
    buildHeatmapFilters,
    HEATMAP_FIELD_IDS,
    BRAND_FIELD_IDS,
} from '@/lib/heatmapFilters';
import { executeMetricQuery, fetchQueryResults } from '@/lib/lightdash';
import {
    COMPETITION_DIFFERENCE_FIELD,
    rowsToProvinceMapOption,
} from '@/lib/provinceMapOption';
import { NextRequest, NextResponse } from 'next/server';

const EXPLORE_GROUP = 'ads_province_heatmap_sales_group_top_m';
const EXPLORE_BRAND = 'ads_province_heatmap_sales_brand_top_m';

const DIMENSIONS_BASE_GROUP = [
    HEATMAP_FIELD_IDS.provinceName,
    HEATMAP_FIELD_IDS.groupName,
];
const DIMENSIONS_TOP_GROUP = [
    HEATMAP_FIELD_IDS.provinceName,
    HEATMAP_FIELD_IDS.groupName,
    HEATMAP_FIELD_IDS.rn,
];
const DIMENSIONS_BASE_BRAND = [
    BRAND_FIELD_IDS.provinceName,
    BRAND_FIELD_IDS.brandName,
];
const DIMENSIONS_TOP_BRAND = [
    BRAND_FIELD_IDS.provinceName,
    BRAND_FIELD_IDS.brandName,
    BRAND_FIELD_IDS.rn,
];
const METRICS_GROUP = [HEATMAP_FIELD_IDS.totalMarketShare];
const METRICS_BRAND = [BRAND_FIELD_IDS.totalMarketShare];

type HeatmapMode = 'topMap' | 'homeMap' | 'competitionMap';
type EntityType = 'group' | 'brand';

type HeatmapRenderBody = {
    projectUuid: string;
    mode: HeatmapMode;
    entityType?: EntityType;
    filters?: {
        bizDate?: string;
        cls2?: string;
        cls3?: string;
        cls4?: string;
        rn?: number;
        groupName?: string;
        groupNames?: [string, string];
        brandName?: string;
        brandNames?: [string, string];
    };
};

function mergeCompetitionRows(
    rowsA: ResultRow[],
    rowsB: ResultRow[],
    provinceField: string,
    shareField: string,
): ResultRow[] {
    const mapA = new Map<string, number>();
    for (const r of rowsA) {
        const name = String(
            (r[provinceField] as { value?: { raw?: unknown } })?.value?.raw ??
                '',
        );
        const v = (r[shareField] as { value?: { raw?: unknown } })?.value?.raw;
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) mapA.set(name, n);
    }
    const mapB = new Map<string, number>();
    for (const r of rowsB) {
        const name = String(
            (r[provinceField] as { value?: { raw?: unknown } })?.value?.raw ??
                '',
        );
        const v = (r[shareField] as { value?: { raw?: unknown } })?.value?.raw;
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(n)) mapB.set(name, n);
    }
    const provinces = new Set([...mapA.keys(), ...mapB.keys()]);
    const out: ResultRow[] = [];
    for (const name of provinces) {
        const a = mapA.get(name) ?? 0;
        const b = mapB.get(name) ?? 0;
        out.push({
            [provinceField]: { value: { raw: name, formatted: name } },
            [COMPETITION_DIFFERENCE_FIELD]: {
                value: {
                    raw: a - b,
                    formatted: `${((a - b) * 100).toFixed(2)}%`,
                },
            },
        } as ResultRow);
    }
    return out;
}

export async function POST(request: NextRequest) {
    let body: HeatmapRenderBody;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'Invalid JSON body' },
            { status: 400 },
        );
    }

    const { projectUuid, mode, entityType: rawEntityType, filters: filterParams } =
        body;
    if (
        !projectUuid ||
        typeof projectUuid !== 'string' ||
        !projectUuid.trim()
    ) {
        return NextResponse.json(
            { error: 'projectUuid is required and must be a non-empty string' },
            { status: 400 },
        );
    }
    if (!mode || !['topMap', 'homeMap', 'competitionMap'].includes(mode)) {
        return NextResponse.json(
            { error: 'mode must be one of: topMap, homeMap, competitionMap' },
            { status: 400 },
        );
    }
    const entityType: EntityType =
        rawEntityType === 'brand' ? 'brand' : 'group';

    const params = filterParams ?? {};
    if (
        mode === 'topMap' &&
        (params.rn == null || params.rn < 1 || params.rn > 3)
    ) {
        return NextResponse.json(
            { error: 'topMap requires filters.rn (1, 2, or 3)' },
            { status: 400 },
        );
    }
    if (mode === 'homeMap') {
        if (entityType === 'group') {
            if (!params.groupName || String(params.groupName).trim() === '') {
                return NextResponse.json(
                    { error: 'homeMap with entityType group requires filters.groupName' },
                    { status: 400 },
                );
            }
        } else {
            if (!params.brandName || String(params.brandName).trim() === '') {
                return NextResponse.json(
                    { error: 'homeMap with entityType brand requires filters.brandName' },
                    { status: 400 },
                );
            }
        }
    }
    if (mode === 'competitionMap') {
        if (entityType === 'group') {
            if (
                !Array.isArray(params.groupNames) ||
                params.groupNames.length !== 2 ||
                !params.groupNames[0] ||
                !params.groupNames[1]
            ) {
                return NextResponse.json(
                    {
                        error:
                            'competitionMap with entityType group requires filters.groupNames as [string, string]',
                    },
                    { status: 400 },
                );
            }
        } else {
            if (
                !Array.isArray(params.brandNames) ||
                params.brandNames.length !== 2 ||
                !params.brandNames[0] ||
                !params.brandNames[1]
            ) {
                return NextResponse.json(
                    {
                        error:
                            'competitionMap with entityType brand requires filters.brandNames as [string, string]',
                    },
                    { status: 400 },
                );
            }
        }
    }

    const filters = buildHeatmapFilters(params, mode, entityType);

    const exploreName =
        entityType === 'brand' ? EXPLORE_BRAND : EXPLORE_GROUP;
    const dimensionsBase =
        entityType === 'brand' ? DIMENSIONS_BASE_BRAND : DIMENSIONS_BASE_GROUP;
    const dimensionsTop =
        entityType === 'brand' ? DIMENSIONS_TOP_BRAND : DIMENSIONS_TOP_GROUP;
    const metrics = entityType === 'brand' ? METRICS_BRAND : METRICS_GROUP;
    const provinceField =
        entityType === 'brand'
            ? BRAND_FIELD_IDS.provinceName
            : HEATMAP_FIELD_IDS.provinceName;
    const shareField =
        entityType === 'brand'
            ? BRAND_FIELD_IDS.totalMarketShare
            : HEATMAP_FIELD_IDS.totalMarketShare;

    try {
        if (mode === 'competitionMap') {
            const nameA =
                entityType === 'brand'
                    ? params.brandNames![0]
                    : params.groupNames![0];
            const nameB =
                entityType === 'brand'
                    ? params.brandNames![1]
                    : params.groupNames![1];
            const baseFilters = buildHeatmapFilters(
                {
                    ...params,
                    ...(entityType === 'brand'
                        ? { brandName: nameA }
                        : { groupName: nameA }),
                },
                'homeMap',
                entityType,
            );
            const { queryUuid: uuidA } = await executeMetricQuery(projectUuid, {
                query: {
                    exploreName,
                    dimensions: dimensionsBase,
                    metrics,
                    filters: baseFilters as Record<string, unknown>,
                    sorts: [],
                    limit: 2500,
                    tableCalculations: [],
                },
            });
            const { rows: rowsA } = await fetchQueryResults(projectUuid, uuidA);

            const filtersB = buildHeatmapFilters(
                {
                    ...params,
                    ...(entityType === 'brand'
                        ? { brandName: nameB }
                        : { groupName: nameB }),
                },
                'homeMap',
                entityType,
            );
            const { queryUuid: uuidB } = await executeMetricQuery(projectUuid, {
                query: {
                    exploreName,
                    dimensions: dimensionsBase,
                    metrics,
                    filters: filtersB as Record<string, unknown>,
                    sorts: [],
                    limit: 2500,
                    tableCalculations: [],
                },
            });
            const { rows: rowsB } = await fetchQueryResults(projectUuid, uuidB);

            const merged = mergeCompetitionRows(
                (rowsA ?? []) as ResultRow[],
                (rowsB ?? []) as ResultRow[],
                provinceField,
                shareField,
            );
            const echartsOption = rowsToProvinceMapOption(
                merged,
                'competitionMap',
                entityType,
            );
            return NextResponse.json({
                echartsOption,
                rawData: merged,
                columns: {},
            });
        }

        const dimensions = mode === 'topMap' ? dimensionsTop : dimensionsBase;
        const { queryUuid } = await executeMetricQuery(projectUuid, {
            query: {
                exploreName,
                dimensions,
                metrics,
                filters: filters as Record<string, unknown>,
                sorts: [],
                limit: 2500,
                tableCalculations: [],
            },
        });
        const { rows, columns } = await fetchQueryResults(
            projectUuid,
            queryUuid,
        );
        const rowsTyped = (rows ?? []) as ResultRow[];
        const echartsOption = rowsToProvinceMapOption(
            rowsTyped,
            mode,
            entityType,
        );
        return NextResponse.json({
            echartsOption,
            rawData: rowsTyped,
            columns: columns ?? {},
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 502 });
    }
}
