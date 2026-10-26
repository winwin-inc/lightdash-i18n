import { ChartType, DashboardTileTypes } from '@lightdash/common';

/**
 * 类型标注的 i18n key + 兜底文案
 * 文案自带括号（中文「（图表）」、英文「(Chart)」），调用方直接拼接即可。
 */
export type ChartTypeLabel = {
    key: string;
    fallback: string;
};

/** 图表类型 → 灰色标注文案（Record 会在新增 ChartType 时编译报错，提醒补齐） */
const CHART_TYPE_LABELS: Record<ChartType, ChartTypeLabel> = {
    [ChartType.CARTESIAN]: {
        key: 'dashboard.sync_chart_colors_types.cartesian',
        fallback: '（图表）',
    },
    [ChartType.PIE]: {
        key: 'dashboard.sync_chart_colors_types.pie',
        fallback: '（饼图）',
    },
    [ChartType.CUSTOM]: {
        key: 'dashboard.sync_chart_colors_types.custom',
        fallback: '（自定义图表）',
    },
    [ChartType.TABLE]: {
        key: 'dashboard.sync_chart_colors_types.table',
        fallback: '（表格）',
    },
    [ChartType.BIG_NUMBER]: {
        key: 'dashboard.sync_chart_colors_types.big_number',
        fallback: '（指标卡）',
    },
    [ChartType.FUNNEL]: {
        key: 'dashboard.sync_chart_colors_types.funnel',
        fallback: '（漏斗图）',
    },
    [ChartType.TREEMAP]: {
        key: 'dashboard.sync_chart_colors_types.treemap',
        fallback: '（矩形树图）',
    },
    [ChartType.DATA_APP_VIZ]: {
        key: 'dashboard.sync_chart_colors_types.data_app_viz',
        fallback: '（数据应用）',
    },
};

const SQL_CHART_LABEL: ChartTypeLabel = {
    key: 'dashboard.sync_chart_colors_types.sql_chart',
    fallback: '（SQL 图表）',
};

/**
 * 看板「同步颜色的图表」列表里的类型标注：
 * - SQL 图表 tile 优先显示「SQL 图表」
 * - 其余按已保存图表的 chartConfig.type 显示（自定义图表 → 「自定义图表」）
 * - 图表类型还没加载出来时返回 null（不显示标注）
 */
export const getChartTypeLabel = (
    tileType: DashboardTileTypes.SAVED_CHART | DashboardTileTypes.SQL_CHART,
    chartType: ChartType | undefined,
): ChartTypeLabel | null => {
    if (tileType === DashboardTileTypes.SQL_CHART) {
        return SQL_CHART_LABEL;
    }
    if (!chartType) return null;
    return CHART_TYPE_LABELS[chartType] ?? null;
};
