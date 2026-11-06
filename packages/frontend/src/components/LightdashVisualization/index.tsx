import {
    assertUnreachable,
    CartesianSeriesType,
    ChartType,
    isSeriesWithMixedChartTypes,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import { IconChartBarOff } from '@tabler/icons-react';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { getChartErrorDiagnosis } from '../../utils/chartErrorDiagnosis';
import { EmptyState } from '../common/EmptyState';
import MantineIcon from '../common/MantineIcon';
import CustomVisualization from '../CustomVisualization';
import FunnelChart from '../FunnelChart';
import SimpleChart from '../SimpleChart';
import SimplePieChart from '../SimplePieChart';
import SimpleStatistic from '../SimpleStatistic';
import SimpleTable from '../SimpleTable';
import SimpleTreemap from '../SimpleTreemap';
import ChartErrorDetails from './ChartErrorDetails';
import {
    isCartesianVisualizationConfig,
    type VisualizationConfig,
} from './types';
import { useVisualizationContext } from './useVisualizationContext';

/** chart_types 的 i18n key（除 cartesian 外的一对一映射，缺省 unknown） */
const CHART_TYPE_I18N_KEYS: Partial<Record<ChartType, string>> = {
    [ChartType.TABLE]: 'table',
    [ChartType.BIG_NUMBER]: 'big_value',
    [ChartType.PIE]: 'pie_chart',
    [ChartType.FUNNEL]: 'funnel_chart',
    [ChartType.TREEMAP]: 'treemap',
    [ChartType.CUSTOM]: 'custom',
};

/**
 * 错误面板顶部展示的图表类型 i18n key（components_explorer_visualization_card_options.chart_types.*）。
 * cartesian 需按 dirtyChartType / flipAxes 细分（与 VisualizationCardOptions 一致），缺省 'mixed'/'unknown'。
 */
const getChartTypeI18nKey = (
    visualizationConfig: VisualizationConfig,
): string => {
    switch (visualizationConfig.chartType) {
        case ChartType.CARTESIAN: {
            if (!isCartesianVisualizationConfig(visualizationConfig)) {
                return 'unknown';
            }
            const { dirtyChartType, dirtyLayout, dirtyEchartsConfig } =
                visualizationConfig.chartConfig;
            if (
                !dirtyChartType ||
                isSeriesWithMixedChartTypes(dirtyEchartsConfig?.series)
            ) {
                return 'mixed';
            }
            if (dirtyChartType === CartesianSeriesType.AREA) {
                return 'area_chart';
            }
            if (dirtyChartType === CartesianSeriesType.LINE) {
                return 'line_chart';
            }
            if (dirtyChartType === CartesianSeriesType.SCATTER) {
                return 'scatter_chart';
            }
            if (dirtyChartType === CartesianSeriesType.BAR) {
                return dirtyLayout?.flipAxes
                    ? 'horizontal_bar_chart'
                    : 'bar_chart';
            }
            return 'mixed';
        }
        default:
            return (
                CHART_TYPE_I18N_KEYS[visualizationConfig.chartType] ?? 'unknown'
            );
    }
};

/** 错误诊断 kind → 一句话说明的 i18n key（仅 permission / notFound / parameter） */
const KIND_SENTENCE_KEYS: Record<
    'permission' | 'notFound' | 'parameter',
    string
> = {
    permission: 'components_chart_error_details.permission',
    notFound: 'components_chart_error_details.not_found',
    parameter: 'components_chart_error_details.parameter',
};

interface LightdashVisualizationProps {
    isDashboard?: boolean;
    tileUuid?: string;
    isTitleHidden?: boolean;
    className?: string;
    'data-testid'?: string;
}

const LightdashVisualization: FC<LightdashVisualizationProps> = memo(
    ({
        isDashboard = false,
        tileUuid,
        isTitleHidden = false,
        className,
        ...props
    }) => {
        const { t } = useTranslation();
        const {
            visualizationConfig,
            minimal,
            apiErrorDetail,
            unsavedMetricQuery,
            explore,
            resultsData,
        } = useVisualizationContext();

        if (!visualizationConfig) {
            return null;
        }

        if (apiErrorDetail) {
            const metricQuery = unsavedMetricQuery ?? resultsData?.metricQuery;
            const diagnosis = metricQuery
                ? getChartErrorDiagnosis({
                      error: apiErrorDetail,
                      metricQuery,
                      explore: explore ?? null,
                  })
                : null;
            // description 是 <Text span>，不能放块级：只有 permission/notFound/parameter
            // 这种一句话说明时才填；字段级摘要由 children 里的 ChartErrorDetails 渲染
            const kindSentence =
                diagnosis &&
                (diagnosis.kind === 'permission' ||
                    diagnosis.kind === 'notFound' ||
                    diagnosis.kind === 'parameter')
                    ? t(KIND_SENTENCE_KEYS[diagnosis.kind])
                    : undefined;

            return (
                <EmptyState
                    icon={
                        // Icon consistent with SuboptimalState in charts
                        <MantineIcon
                            color="gray.5"
                            size="xxl"
                            icon={IconChartBarOff}
                        />
                    }
                    h="100%"
                    w="100%"
                    justify="center"
                    pt="md"
                    pb="md"
                    title={t(
                        'components_lightdash_visualization.unable_to_load_visualization',
                    )}
                    description={kindSentence}
                >
                    <Box mah="100%" style={{ overflow: 'auto' }} w="100%">
                        <ChartErrorDetails
                            error={apiErrorDetail}
                            metricQuery={metricQuery}
                            explore={explore ?? null}
                            chartTypeLabel={t(
                                `components_explorer_visualization_card_options.chart_types.${getChartTypeI18nKey(
                                    visualizationConfig,
                                )}`,
                            )}
                        />
                    </Box>
                </EmptyState>
            );
        }

        switch (visualizationConfig.chartType) {
            case ChartType.BIG_NUMBER:
                return (
                    <SimpleStatistic
                        minimal={minimal}
                        isTitleHidden={isTitleHidden}
                        isDashboard={isDashboard}
                        className={className}
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.TABLE:
                return (
                    <SimpleTable
                        tileUuid={tileUuid}
                        minimal={minimal}
                        isDashboard={!!isDashboard}
                        className={className}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.CARTESIAN:
                return (
                    <SimpleChart
                        className={className}
                        isInDashboard={!!isDashboard}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.PIE:
                return (
                    <SimplePieChart
                        className={className}
                        isInDashboard={!!isDashboard}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.FUNNEL:
                return (
                    <FunnelChart
                        className={className}
                        isInDashboard={!!isDashboard}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.TREEMAP:
                return (
                    <SimpleTreemap
                        className={className}
                        isInDashboard={!!isDashboard}
                        $shouldExpand
                        data-testid={props['data-testid']}
                        {...props}
                    />
                );
            case ChartType.CUSTOM:
                return (
                    <CustomVisualization
                        data-testid={props['data-testid']}
                        className={className}
                    />
                );
            case ChartType.DATA_APP_VIZ:
                return null;

            default:
                return assertUnreachable(
                    visualizationConfig,
                    `Chart type is not implemented`,
                );
        }
    },
);

export default LightdashVisualization;
