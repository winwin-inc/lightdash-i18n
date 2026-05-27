/**
 * 将 Lightdash 返回的 rows 转为 ECharts 中国省份地图 option。
 * 约定：地图需已通过 echarts.registerMap('china', geoJson) 注册。
 * 优先与 brand-fe 省份热力图一致：默认展示省内颜色与省内文案（省名+实体名），
 * 不依赖悬浮；省份名与 GeoJSON properties.name 一致才能填色；仅当 rows 为空时展示「暂无数据」。
 */

import type { ResultRow } from './echartsOption';
import { HEATMAP_FIELD_IDS, BRAND_FIELD_IDS } from './heatmapFilters';

export type HeatmapFieldIds = {
    provinceName: string;
    entityName: string;
    totalMarketShare: string;
};

/** 用于按省分组的规范名（去后缀），保证 黑龙江省 / 黑龙江 等视为同一省 */
function toProvinceKey(name: string): string {
    const s = name.trim();
    return s.replace(/(省|市|自治区|特别行政区)$/, '') || s;
}

/** 短名 → GeoJSON 全称，与 tdt_xg_china_topojson 的 properties.name 一致，便于 series.data[].name 匹配填色 */
const PROVINCE_SHORT_TO_FULL: Record<string, string> = {
    河南: '河南省',
    浙江: '浙江省',
    北京: '北京市',
    天津: '天津市',
    上海: '上海市',
    重庆: '重庆市',
    黑龙江: '黑龙江省',
    吉林: '吉林省',
    辽宁: '辽宁省',
    河北: '河北省',
    山东: '山东省',
    江苏: '江苏省',
    安徽: '安徽省',
    福建: '福建省',
    江西: '江西省',
    广东: '广东省',
    广西: '广西壮族自治区',
    海南: '海南省',
    四川: '四川省',
    贵州: '贵州省',
    云南: '云南省',
    陕西: '陕西省',
    甘肃: '甘肃省',
    青海: '青海省',
    台湾: '台湾省',
    内蒙古: '内蒙古自治区',
    新疆: '新疆维吾尔自治区',
    西藏: '西藏自治区',
    香港: '香港特别行政区',
    澳门: '澳门特别行政区',
    山西: '山西省',
    湖北: '湖北省',
    湖南: '湖南省',
};

/** 转为地图用省名：与 GeoJSON properties.name 一致（全称），API 若返回短名则查表 */
function toMapProvinceName(raw: string): string {
    const s = raw.trim();
    if (!s) return s;
    if (/(省|市|自治区|特别行政区)$/.test(s)) return s;
    return PROVINCE_SHORT_TO_FULL[s] ?? s;
}

/** 仅将明确无效的实体名视为空：空串、∅、或 JS 的 [object Object] 等，不误杀正常名称 */
function normalizeEntityName(s: string): string {
    const t = (s ?? '').trim();
    if (t === '' || t === '∅') return '';
    if (/^\[object\s+.+\]$/.test(t)) return '';
    return t;
}

function getRaw(row: ResultRow, fieldId: string): unknown {
    const cell = row[fieldId];
    return cell?.value?.raw ?? null;
}

function getFormatted(row: ResultRow, fieldId: string): string {
    const cell = row[fieldId];
    const f = cell?.value?.formatted;
    if (f != null) return String(f);
    const r = cell?.value?.raw;
    return r != null ? String(r) : '';
}

function getShare(row: ResultRow, shareFieldId: string): number {
    const v = getRaw(row, shareFieldId);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

const CATEGORY_COLORS = [
    '#5470c6',
    '#91cc75',
    '#fac858',
    '#ee6666',
    '#73c0de',
    '#3ba272',
    '#fc8452',
    '#9a60b4',
    '#ea7ccc',
];

function colorForGroup(index: number): string {
    return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export type HeatmapMode = 'topMap' | 'homeMap' | 'competitionMap';

/**
 * 冠军/根据地：按实体（集团或品牌）着色，tooltip 显示省份、实体名、市占率。
 * topMap 时按省去重，每省只保留市占率最高的一行（避免上游返回多行同省导致地图只显示最后一条）。
 */
function buildEntityMapOption(
    rows: ResultRow[],
    fieldIds: HeatmapFieldIds,
    entityLabel: string,
    mode: HeatmapMode,
): Record<string, unknown> {
    let rowsToUse = rows;
    if (mode === 'topMap' && rows.length > 0) {
        const byProvince = new Map<string, { row: ResultRow; share: number }>();
        for (const r of rows) {
            const rawName = getFormatted(r, fieldIds.provinceName) || String(getRaw(r, fieldIds.provinceName) ?? '');
            const provinceKey = toProvinceKey(rawName);
            const share = getShare(r, fieldIds.totalMarketShare);
            const existing = byProvince.get(provinceKey);
            if (!existing || share > existing.share) {
                byProvince.set(provinceKey, { row: r, share });
            }
        }
        rowsToUse = Array.from(byProvince.values()).map((x) => x.row);
    }
    const entityIndex = new Map<string, number>();
    const entityProvinceCount = new Map<string, number>();
    let idx = 0;
    for (const r of rowsToUse) {
        const rawEntity = getFormatted(r, fieldIds.entityName) || String(getRaw(r, fieldIds.entityName) ?? '');
        const entityName = normalizeEntityName(rawEntity);
        if (entityName && !entityIndex.has(entityName)) {
            entityIndex.set(entityName, idx++);
        }
        if (entityName) {
            entityProvinceCount.set(entityName, (entityProvinceCount.get(entityName) ?? 0) + 1);
        }
    }
    const data = rowsToUse
        .map((r) => {
            const rawName =
                getFormatted(r, fieldIds.provinceName) || String(getRaw(r, fieldIds.provinceName) ?? '');
            const name = toMapProvinceName(rawName);
            const rawEntity = getFormatted(r, fieldIds.entityName) || String(getRaw(r, fieldIds.entityName) ?? '');
            const entityName = normalizeEntityName(rawEntity);
            const share = getShare(r, fieldIds.totalMarketShare);
            const hasEntity = entityName !== '' && share > 0;
            const color = hasEntity
                ? colorForGroup(entityIndex.get(entityName)!)
                : '#f0f0f0';
            const provinceCount = entityName ? entityProvinceCount.get(entityName) ?? 0 : 0;
            return {
                name,
                value: share,
                entityName,
                entityProvinceCount: provinceCount,
                itemStyle: { areaColor: color },
            };
        })
        .filter((d) => d.name.length > 0);

    const entityNames = Array.from(entityIndex.keys());
    const legendData = entityNames.map((name, i) => ({
        name: `${name} (${entityProvinceCount.get(name) ?? 0})`,
        itemStyle: { color: colorForGroup(i) },
    }));

    return {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            confine: true,
            backgroundColor: 'rgba(255,255,255,0.96)',
            borderColor: '#e0e0e0',
            borderWidth: 1,
            padding: [10, 12],
            textStyle: { fontSize: 12, color: '#333' },
            formatter: (params: {
                name?: string;
                data?: {
                    name: string;
                    value: number;
                    entityName?: string;
                    entityProvinceCount?: number;
                };
            }) => {
                const d = params?.data;
                const regionName = d?.name ?? params?.name ?? '';
                if (!d) return regionName ? `${regionName}<br/>暂无数据` : '';
                const pct = typeof d.value === 'number' ? (d.value * 100).toFixed(2) + '%' : '0.00%';
                const entity = d.entityName ?? '';
                const count = d.entityProvinceCount ?? 0;
                return `${regionName}<br/>${entityLabel}：${entity || '-'}<br/>市占率：${pct}<br/>全国出现次数：${count}`;
            },
        },
        legend: {
            orient: 'vertical',
            left: 12,
            top: 'middle',
            data: legendData.map((d) => d.name),
            formatter: (name: string) => name,
            textStyle: { fontSize: 12, color: '#333' },
            itemGap: 8,
        },
        series: [
            {
                type: 'map',
                map: 'china',
                roam: false,
                scaleLimit: { min: 0.8, max: 2 },
                symbol: 'none',
                symbolSize: 0,
                itemStyle: {
                    areaColor: '#f0f0f0',
                    borderColor: '#fff',
                    borderWidth: 1,
                },
                label: {
                    show: true,
                    fontSize: 11,
                    color: '#333',
                    formatter: (params: { name?: string; data?: { entityName?: string } }) => {
                        const shortName = toProvinceKey(params?.name ?? '');
                        const entityName = params?.data?.entityName;
                        if (entityName) return `${shortName}\n${entityName}`;
                        return shortName || '';
                    },
                },
                emphasis: {
                    label: { show: true, fontSize: 11, color: '#333' },
                    itemStyle: { areaColor: null, borderColor: '#333', borderWidth: 1 },
                },
                data: data.map((d) => ({
                    name: d.name,
                    value: d.value,
                    entityName: d.entityName,
                    entityProvinceCount: d.entityProvinceCount,
                    itemStyle: d.itemStyle,
                    symbolSize: 0,
                })),
            },
        ],
    };
}

/** 竞争模式合并后 rows 中差值的字段 id（由 render API 写入） */
export const COMPETITION_DIFFERENCE_FIELD = '__heatmap_difference__';

/**
 * 竞争：按差值着色，正绿负红零灰。rows 需含 COMPETITION_DIFFERENCE_FIELD 或 total_market_share 作为差值。
 */
function buildCompetitionMapOption(
    rows: ResultRow[],
    provinceFieldId: string,
    shareFieldId: string,
): Record<string, unknown> {
    const data = rows.map((r) => {
        const rawName = getFormatted(r, provinceFieldId) || String(getRaw(r, provinceFieldId) ?? '');
        const name = toMapProvinceName(rawName);
        const rawDiff = getRaw(r, COMPETITION_DIFFERENCE_FIELD);
        const diff = typeof rawDiff === 'number' && Number.isFinite(rawDiff)
            ? rawDiff
            : getShare(r, shareFieldId);
        let color = '#e0e0e0';
        if (diff > 0) color = '#91cc75';
        else if (diff < 0) color = '#ee6666';
        return { name, value: diff, itemStyle: { areaColor: color } };
    });

    return {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            confine: true,
            backgroundColor: 'rgba(255,255,255,0.96)',
            borderColor: '#e0e0e0',
            borderWidth: 1,
            padding: [10, 12],
            textStyle: { fontSize: 12, color: '#333' },
            formatter: (params: { name?: string; data?: { name: string; value: number } }) => {
                const d = params?.data;
                const regionName = d?.name ?? params?.name ?? '';
                if (!d) return regionName ? `${regionName}<br/>暂无数据` : '';
                const v = typeof d.value === 'number' ? (d.value * 100).toFixed(2) + '%' : d.value;
                return `${d.name}<br/>差值：${v}`;
            },
        },
        visualMap: {
            min: -1,
            max: 1,
            left: 12,
            bottom: 24,
            text: ['高', '低'],
            textStyle: { fontSize: 11, color: '#666' },
            realtime: false,
            calculable: true,
            inRange: { color: ['#ee6666', '#fff', '#91cc75'] },
        },
        series: [
            {
                type: 'map',
                map: 'china',
                roam: false,
                scaleLimit: { min: 0.8, max: 2 },
                symbol: 'none',
                symbolSize: 0,
                itemStyle: {
                    areaColor: '#f0f0f0',
                    borderColor: '#fff',
                    borderWidth: 1,
                },
                label: { show: false },
                emphasis: {
                    label: { show: true, fontSize: 11, color: '#333' },
                    itemStyle: { areaColor: null, borderColor: '#333', borderWidth: 1 },
                },
                data: data.map((d) => ({
                    name: d.name,
                    value: d.value,
                    itemStyle: d.itemStyle,
                    symbolSize: 0,
                })),
            },
        ],
    };
}

/** 集团地图默认字段与文案 */
const GROUP_FIELD_IDS: HeatmapFieldIds = {
    provinceName: HEATMAP_FIELD_IDS.provinceName,
    entityName: HEATMAP_FIELD_IDS.groupName,
    totalMarketShare: HEATMAP_FIELD_IDS.totalMarketShare,
};

/** 品牌地图默认字段与文案 */
const BRAND_MAP_FIELD_IDS: HeatmapFieldIds = {
    provinceName: BRAND_FIELD_IDS.provinceName,
    entityName: BRAND_FIELD_IDS.brandName,
    totalMarketShare: BRAND_FIELD_IDS.totalMarketShare,
};

/**
 * rows 转 ECharts 地图 option。竞争模式时 rows 每行应含合并后的 value（差值）。
 * entityType 用于选择集团/品牌字段与文案，默认集团。
 */
export function rowsToProvinceMapOption(
    rows: ResultRow[],
    mode: HeatmapMode,
    entityType: 'group' | 'brand' = 'group',
): Record<string, unknown> {
    if (rows.length === 0) {
        return {
            title: { text: '暂无数据', left: 'center', top: 'middle' },
            series: [{ type: 'map', map: 'china', data: [] }],
        };
    }
    // 有 rows 时始终返回完整地图 option，不展示「暂无数据」；默认展示颜色与省内文案（与 brand-fe 一致）
    const fieldIds = entityType === 'brand' ? BRAND_MAP_FIELD_IDS : GROUP_FIELD_IDS;
    const entityLabel = entityType === 'brand' ? '品牌' : '集团';
    if (mode === 'competitionMap') {
        return buildCompetitionMapOption(rows, fieldIds.provinceName, fieldIds.totalMarketShare);
    }
    return buildEntityMapOption(rows, fieldIds, entityLabel, mode);
}
