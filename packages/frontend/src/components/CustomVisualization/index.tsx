import { Anchor, Center, Text } from '@mantine/core';
import { IconChartBarOff } from '@tabler/icons-react';
import { Suspense, lazy, useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type CustomVisualizationConfigAndData } from '../../hooks/useCustomVisualizationConfig';
import { isCustomVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { LoadingChart } from '../SimpleChart';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';

const VegaLite = lazy(() =>
    import('react-vega').then((module) => ({ default: module.VegaLite })),
);

type Props = {
    className?: string;
    'data-testid'?: string;
};

const CustomVisualization: FC<Props> = (props) => {
    const { isLoading, visualizationConfig, resultsData } =
        useVisualizationContext();
    const { t } = useTranslation();

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    if (isLoading) {
        return <LoadingChart />;
    }

    if (!isCustomVisualizationConfig(visualizationConfig)) return null;
    const spec = visualizationConfig.chartConfig.validConfig.spec;

    if (
        !visualizationConfig ||
        !isCustomVisualizationConfig(visualizationConfig) ||
        !spec
    ) {
        return (
            <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
                <SuboptimalState
                    title={t(
                        'components_custom_visualization.no_visualization_loaded',
                    )}
                    description={
                        <Text>
                            {t(
                                'components_custom_visualization.tooltip.part_1',
                            )}{' '}
                            <Anchor
                                href="https://vega.github.io/vega-lite/examples/"
                                target="_blank"
                            >
                                {t(
                                    'components_custom_visualization.tooltip.part_2',
                                )}
                            </Anchor>{' '}
                            {t(
                                'components_custom_visualization.tooltip.part_3',
                            )}
                        </Text>
                    }
                    icon={IconChartBarOff}
                />
            </div>
        );
    }

    // TODO: 'chartConfig' is more props than config. It has data and
    // configuration for the chart. We should consider renaming it generally.
    const visProps =
        visualizationConfig.chartConfig as CustomVisualizationConfigAndData;

    const data = { values: visProps.series };

    return (
        <div
            data-testid={props['data-testid']}
            className={props.className}
            style={{
                minHeight: 'inherit',
                height: '100%',
                width: '100%',
            }}
        >
            <Suspense
                fallback={
                    <Center>
                        <LoadingChart />
                    </Center>
                }
            >
                <VegaLite
                    style={{
                        width: 'inherit',
                        height: 'inherit',
                        minHeight: 'inherit',
                    }}
                    config={{
                        autosize: {
                            resize: true,
                            type: 'fit',
                        },
                    }}
                    // TODO: We are ignoring some typescript errors here because the type
                    // that vegalite expects doesn't include a few of the properties
                    // that are required to make data and layout properties work. This
                    // might be a mismatch in which of the vega spec union types gets
                    // picked, or a bug in the vegalite typescript definitions.
                    // @ts-ignore
                    spec={{
                        ...spec,
                        // @ts-ignore, see above
                        width: 'container',
                        // @ts-ignore, see above
                        height: 'container',

                        data: { name: 'values' },
                    }}
                    data={data}
                    actions={false}
                />
            </Suspense>
        </div>
    );
};

export default CustomVisualization;
