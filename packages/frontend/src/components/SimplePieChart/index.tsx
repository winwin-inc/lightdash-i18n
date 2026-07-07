import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconChartPieOff } from '@tabler/icons-react';
import { type ECElementEvent } from 'echarts';
import { type EChartsReactProps, type Opts } from 'echarts-for-react/lib/types';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';

import useEchartsPieConfig, {
    type PieSeriesDataPoint,
} from '../../hooks/echarts/useEchartsPieConfig';
import { useLegendDoubleClickSelection } from '../../hooks/echarts/useLegendDoubleClickSelection';
import useApp from '../../providers/App/useApp';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import LightdashECharts from '../common/LightdashECharts';
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

type SimplePieChartProps = {
    isInDashboard: boolean;
    $shouldExpand?: boolean;
    className?: string;
    'data-testid'?: string;
} & Omit<EChartsReactProps, 'option'>;

const EchartOptions: Opts = { renderer: 'svg' };

const SimplePieChart: FC<SimplePieChartProps> = memo((props) => {
    const {
        isInDashboard,
        $shouldExpand,
        className,
        'data-testid': dataTestId,
    } = props;

    const { chartRef, isLoading, resultsData } = useVisualizationContext();
    const { selectedLegends, onLegendChange } = useLegendDoubleClickSelection();

    const pieChartOptions = useEchartsPieConfig(selectedLegends, isInDashboard);
    const { user } = useApp();

    const [isOpen, { open, close }] = useDisclosure();
    const [menuProps, setMenuProps] = useState<{
        position: PieChartContextMenuProps['menuPosition'];
        value: PieChartContextMenuProps['value'];
        rows: PieChartContextMenuProps['rows'];
    }>();

    useEffect(() => {
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

    const hasOutsideLabels = useMemo(() => {
        if (!pieChartOptions?.pieSeriesOption?.data) return false;
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

    if (isLoading) return <LoadingChart />;
    if (!pieChartOptions) return <EmptyChart />;

    return (
        <>
            <LightdashECharts
                ref={chartRef}
                data-testid={dataTestId}
                className={className}
                style={{
                    ...($shouldExpand
                        ? {
                              minHeight: 'inherit',
                              height: '100%',
                              width: '100%',
                          }
                        : {
                              minHeight: 'inherit',
                              width: '100%',
                          }),
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
