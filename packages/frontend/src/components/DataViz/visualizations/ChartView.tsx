import { isVizTableConfig, type AllVizChartConfig } from '@lightdash/common';
import { Box, LoadingOverlay } from '@mantine/core';
import { type SerializedError } from '@reduxjs/toolkit';
import { IconAlertCircle } from '@tabler/icons-react';
import EChartsReact, { type EChartsReactProps } from 'echarts-for-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import SuboptimalState from '../../common/SuboptimalState/SuboptimalState';

type Props = {
    onChartReady?: EChartsReactProps['onChartReady'];
    config: AllVizChartConfig | undefined;
    spec: EChartsReactProps['option'] | undefined;
    isLoading: boolean;
    error?: SerializedError | null;
} & Partial<Pick<EChartsReactProps, 'style'>>;

const ChartView = memo<Props>(
    ({ config, isLoading, error, style, spec, onChartReady }) => {
        const { t } = useTranslation();

        if (isVizTableConfig(config)) {
            throw new Error(
                t(
                    'components_dataviz_visualizations_chart_view.vizchartview_error',
                ),
            );
        }

        if (
            config &&
            (!config.fieldConfig?.x || config.fieldConfig.y.length === 0)
        ) {
            return (
                <SuboptimalState
                    title={t(
                        'components_dataviz_visualizations_chart_view.error_tip.title',
                    )}
                    description={
                        !config.fieldConfig?.x
                            ? t(
                                  'components_dataviz_visualizations_chart_view.error_tip.content.part_1',
                              )
                            : t(
                                  'components_dataviz_visualizations_chart_view.error_tip.content.part_2',
                              )
                    }
                    icon={IconAlertCircle}
                    mt="xl"
                />
            );
        }

        if (error && !isLoading) {
            return (
                <SuboptimalState
                    title={t(
                        'components_dataviz_visualizations_chart_view.error_loading_tip',
                    )}
                    description={error.message}
                    icon={IconAlertCircle}
                    mt="xl"
                />
            );
        }

        return (
            <Box h="100%" w="100%" data-testid={`chart-view-${config?.type}`}>
                <LoadingOverlay
                    visible={isLoading}
                    loaderProps={{ color: 'gray' }}
                />

                {spec && (
                    <EChartsReact
                        className="sentry-block ph-no-capture"
                        option={spec}
                        notMerge
                        opts={{ renderer: 'svg' }}
                        style={style}
                        onChartReady={onChartReady}
                    />
                )}
            </Box>
        );
    },
);

export default ChartView;
