import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconChartPieOff } from '@tabler/icons-react';
import { type ECElementEvent } from 'echarts';
import EChartsReact from 'echarts-for-react';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import { memo, useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useEchartsPieConfig, {
    type PieSeriesDataPoint,
} from '../../hooks/echarts/useEchartsPieConfig';
import { useLegendDoubleClickSelection } from '../../hooks/echarts/useLegendDoubleClickSelection';
import useApp from '../../providers/App/useApp';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import PieChartContextMenu, {
    type PieChartContextMenuProps,
} from './PieChartContextMenu';

const EmptyChart = () => {
    const { t } = useTranslation();

    return (
        <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
            <SuboptimalState
                title={t('components_simple_pie_chart.empty.title')}
                description={t('components_simple_pie_chart.empty.description')}
                icon={IconChartPieOff}
            />
        </div>
    );
};

const LoadingChart = () => {
    const { t } = useTranslation();

    return (
        <div style={{ height: '100%', width: '100%', padding: '50px 0' }}>
            <SuboptimalState
                title={t('components_simple_pie_chart.loading.title')}
                loading
                className="loading_chart"
            />
        </div>
    );
};

type SimplePieChartProps = Omit<EChartsReactProps, 'option'> & {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
};

const EchartOptions: Opts = { renderer: 'svg' };

const SimplePieChart: FC<SimplePieChartProps> = memo((props) => {
    const { chartRef, isLoading, resultsData } = useVisualizationContext();
    const { selectedLegends, onLegendChange } = useLegendDoubleClickSelection();

    const pieChartOptions = useEchartsPieConfig(
        selectedLegends,
        props.isInDashboard,
    );
    const { user } = useApp();

    const [isOpen, { open, close }] = useDisclosure();
    const [menuProps, setMenuProps] = useState<{
        position: PieChartContextMenuProps['menuPosition'];
        value: PieChartContextMenuProps['value'];
        rows: PieChartContextMenuProps['rows'];
    }>();

    useEffect(() => {
        // Load all the rows
        resultsData?.setFetchAll(true);
    }, [resultsData]);

    useEffect(() => {
        const listener = () => chartRef.current?.getEchartsInstance().resize();
        window.addEventListener('resize', listener);
        return () => window.removeEventListener('resize', listener);
    });

    const handleOpenContextMenu = useCallback(
        (e: ECElementEvent) => {
            const event = e.event?.event as unknown as PointerEvent;
            const data = e.data as PieSeriesDataPoint;

            setMenuProps({
                value: data.meta.value,
                position: {
                    left: event.clientX,
                    top: event.clientY,
                },
                rows: data.meta.rows,
            });

            open();
        },
        [open],
    );

    const handleCloseContextMenu = useCallback(() => {
        setMenuProps(undefined);
        close();
    }, [close]);

    if (isLoading) return <LoadingChart />;
    if (!pieChartOptions) return <EmptyChart />;

    // 移动端优化：检测是否有外侧标签，如果有则允许标签超出容器显示
    const hasOutsideLabels = useMemo(() => {
        if (!pieChartOptions?.pieSeriesOption?.data) return false;
        // 检查饼图数据项中是否有外侧标签
        const seriesData = pieChartOptions.pieSeriesOption.data;
        return seriesData.some(
            (item) =>
                typeof item === 'object' &&
                item !== null &&
                'label' in item &&
                typeof item.label === 'object' &&
                item.label !== null &&
                'position' in item.label &&
                item.label.position === 'outside',
        );
    }, [pieChartOptions]);

    const isMobile = useMediaQuery('(max-width: 768px)');
    const shouldAllowOverflow = isMobile && hasOutsideLabels;

    return (
        <>
            <EChartsReact
                ref={chartRef}
                data-testid={props['data-testid']}
                className={props.className}
                style={{
                    ...(props.$shouldExpand
                        ? {
                              minHeight: 'inherit',
                              height: '100%',
                              width: '100%',
                          }
                        : {
                              minHeight: 'inherit',
                              // height defaults to 300px
                              width: '100%',
                          }),
                    // 移动端外侧标签：允许标签超出容器显示
                    ...(shouldAllowOverflow
                        ? {
                              overflow: 'visible',
                              position: 'relative',
                          }
                        : {}),
                }}
                opts={EchartOptions}
                option={pieChartOptions.eChartsOption}
                notMerge
                {...props}
                onEvents={{
                    click: handleOpenContextMenu,
                    oncontextmenu: handleOpenContextMenu,
                    legendselectchanged: onLegendChange,
                }}
            />

            {user.data && (
                <PieChartContextMenu
                    value={menuProps?.value}
                    menuPosition={menuProps?.position}
                    rows={menuProps?.rows}
                    opened={isOpen}
                    onClose={handleCloseContextMenu}
                />
            )}
        </>
    );
});

export default SimplePieChart;
