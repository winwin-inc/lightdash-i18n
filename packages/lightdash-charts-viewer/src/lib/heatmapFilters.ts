/**
 * Lightdash metric-query filters 约定与构建。
 * 与 Lightdash API v2 metric-query 的 filters 结构对齐：
 * Filters = { dimensions?: FilterGroup }
 * FilterGroup = { id: string, and: FilterRule[] } | { id: string, or: FilterRule[] }
 * FilterRule = { id: string, target: { fieldId: string }, operator: string, values?: unknown[] }
 */

export type FilterRule = {
    id: string;
    target: { fieldId: string };
    operator: string;
    values?: unknown[];
};

export type FilterGroup = {
    id: string;
    and: FilterRule[];
};

export type LightdashFilters = {
    dimensions?: FilterGroup;
    metrics?: FilterGroup;
    tableCalculations?: FilterGroup;
};

const PREFIX_GROUP = 'ads_province_heatmap_sales_group_top_m';
const PREFIX_BRAND = 'ads_province_heatmap_sales_brand_top_m';

export const HEATMAP_FIELD_IDS = {
    provinceName: `${PREFIX_GROUP}_province_name`,
    groupName: `${PREFIX_GROUP}_group_name`,
    totalMarketShare: `${PREFIX_GROUP}_total_market_share`,
    bizDate: `${PREFIX_GROUP}_biz_date`,
    rn: `${PREFIX_GROUP}_rn`,
    cls2: `${PREFIX_GROUP}_cls_2`,
    cls3: `${PREFIX_GROUP}_cls_3`,
    cls4: `${PREFIX_GROUP}_cls_4`,
    lat: `${PREFIX_GROUP}_lat`,
    lon: `${PREFIX_GROUP}_lon`,
} as const;

export const BRAND_FIELD_IDS = {
    provinceName: `${PREFIX_BRAND}_province_name`,
    brandName: `${PREFIX_BRAND}_brand_name`,
    totalMarketShare: `${PREFIX_BRAND}_total_market_share`,
    bizDate: `${PREFIX_BRAND}_biz_date`,
    rn: `${PREFIX_BRAND}_rn`,
    cls2: `${PREFIX_BRAND}_cls_2`,
    cls3: `${PREFIX_BRAND}_cls_3`,
    cls4: `${PREFIX_BRAND}_cls_4`,
    lat: `${PREFIX_BRAND}_lat`,
    lon: `${PREFIX_BRAND}_lon`,
} as const;

export type EntityType = 'group' | 'brand';

let ruleIdCounter = 0;
function nextId(): string {
    ruleIdCounter += 1;
    return `heatmap_${ruleIdCounter}_${Date.now()}`;
}

function dimRule(fieldId: string, value: unknown): FilterRule {
    return {
        id: nextId(),
        target: { fieldId },
        operator: 'equals',
        values: value !== undefined && value !== null ? [value] : [],
    };
}

type HeatmapFilterParams = {
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

/**
 * 根据 entityType、mode 与筛选参数构建 Lightdash filters（仅 dimensions）。
 */
export function buildHeatmapFilters(
    params: HeatmapFilterParams,
    mode: 'topMap' | 'homeMap' | 'competitionMap',
    entityType: EntityType = 'group',
): LightdashFilters {
    const rules: FilterRule[] = [];
    const ids = entityType === 'brand' ? BRAND_FIELD_IDS : HEATMAP_FIELD_IDS;
    const entityFieldId = entityType === 'brand' ? BRAND_FIELD_IDS.brandName : HEATMAP_FIELD_IDS.groupName;

    if (params.bizDate != null && params.bizDate !== '') {
        rules.push(dimRule(ids.bizDate, params.bizDate));
    }
    if (params.cls2 != null && params.cls2 !== '') {
        rules.push(dimRule(ids.cls2, params.cls2));
    }
    if (params.cls3 != null && params.cls3 !== '') {
        rules.push(dimRule(ids.cls3, params.cls3));
    }
    if (params.cls4 != null && params.cls4 !== '') {
        rules.push(dimRule(ids.cls4, params.cls4));
    }

    if (mode === 'topMap' && params.rn != null) {
        // 与 Lightdash 返回的 dimension raw 类型一致（多为 string "1"），避免过滤不生效
        rules.push(dimRule(ids.rn, String(params.rn)));
    }
    if (mode === 'homeMap') {
        const entityName = entityType === 'brand' ? params.brandName : params.groupName;
        if (entityName != null && String(entityName).trim() !== '') {
            rules.push(dimRule(entityFieldId, entityName));
        }
    }
    // competitionMap: 分别两次 query 各传一个实体名

    if (rules.length === 0) {
        return {};
    }
    return {
        dimensions: {
            id: `heatmap_dimensions_${entityType}`,
            and: rules,
        },
    };
}
