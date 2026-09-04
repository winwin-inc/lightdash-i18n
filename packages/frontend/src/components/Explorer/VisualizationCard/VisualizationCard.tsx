import { subject } from '@casl/ability';
import {
    ChartType,
    ECHARTS_DEFAULT_COLORS,
    isTableChartConfig,
    NotFoundError,
    type ApiErrorDetail,
    type PivotConfig,
} from '@lightdash/common';
import { Button, Flex } from '@mantine/core';
import {
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import {
    memo,
    useCallback,
    useLayoutEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import ErrorBoundary from '../../../features/errorBoundary/ErrorBoundary';
import {
    explorerActions,
    selectColumnOrder,
    selectFromDashboard,
    selectIsEditMode,
    selectIsVisualizationConfigOpen,
    selectIsVisualizationExpanded,
    selectMetricQuery,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import { type EChartSeries } from '../../../hooks/echarts/useEchartsCartesianConfig';
import { uploadGsheet } from '../../../hooks/gdrive/useGdrive';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { useDashboardQuery } from '../../../hooks/dashboard/useDashboard';
import { useCalculateCount } from '../../../hooks/useCalculateCount';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorerChartPagedQuery } from '../../../hooks/useExplorerChartPagedQuery';
import { useExplorerQuery } from '../../../hooks/useExplorerQuery';
import {
    getTableConfigPageSize,
    isWarehousePaginatedTableConfig,
} from '../../../utils/isWarehousePaginatedTableChart';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { ExplorerSection } from '../../../providers/Explorer/types';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import ChartDownloadMenu from '../../common/ChartDownload/ChartDownloadMenu';
import CollapsableCard from '../../common/CollapsableCard/CollapsableCard';
import { COLLAPSABLE_CARD_BUTTON_PROPS } from '../../common/CollapsableCard/constants';
import MantineIcon from '../../common/MantineIcon';
import LightdashVisualization from '../../LightdashVisualization';
import { type TablePaginationState } from '../../LightdashVisualization/context';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import { type EchartSeriesClickEvent } from '../../SimpleChart';
import { VisualizationConfigPortalId } from '../ExplorePanel/constants';
import VisualizationConfig from '../VisualizationCard/VisualizationConfig';
import { SeriesContextMenu } from './SeriesContextMenu';
import VisualizationWarning from './VisualizationWarning';

export type EchartsClickEvent = {
    event: EchartSeriesClickEvent;
    dimensions: string[];
    series: EChartSeries[];
};

type Props = {
    projectUuid?: string;
};

const VisualizationCard: FC<Props> = memo(({ projectUuid: fallBackUUid }) => {
    const { health } = useApp();
    const { data: org } = useOrganization();
    const { t } = useTranslation();

    const savedChart = useExplorerContext(
        (context) => context.state.savedChart,
    );

    const {
        query,
        queryResults,
        isLoading,
        getDownloadQueryUuid,
        missingRequiredParameters,
        computedMetricQuery,
        parameters,
    } = useExplorerQuery();
    const fromDashboard = useExplorerSelector(selectFromDashboard);

    const setPivotFields = useExplorerContext(
        (context) => context.actions.setPivotFields,
    );
    const setChartType = useExplorerContext(
        (context) => context.actions.setChartType,
    );
    const setChartConfig = useExplorerContext(
        (context) => context.actions.setChartConfig,
    );

    const isOpen = useExplorerSelector(selectIsVisualizationExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const isVisualizationConfigOpen = useExplorerSelector(
        selectIsVisualizationConfigOpen,
    );
    const dispatch = useExplorerDispatch();

    const toggleExpandedSection = useCallback(
        (section: ExplorerSection) => {
            dispatch(explorerActions.toggleExpandedSection(section));
        },
        [dispatch],
    );

    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);
    const columnOrder = useExplorerSelector(selectColumnOrder);

    // Read chartConfig and pivotConfig from Context (not synced to Redux)
    const chartConfig = useExplorerContext(
        (context) => context.state.unsavedChartVersion.chartConfig,
    );
    const pivotConfig = useExplorerContext(
        (context) => context.state.unsavedChartVersion.pivotConfig,
    );
    const projectUuid = useExplorerContext(
        (context) => context.state.savedChart?.projectUuid || fallBackUUid,
    );

    const isWarehousePaginatedTable = useMemo(
        () => isWarehousePaginatedTableConfig(chartConfig, pivotConfig),
        [chartConfig, pivotConfig],
    );

    const configuredPageSize = useMemo(
        () =>
            getTableConfigPageSize(
                chartConfig,
                health.data?.query.maxLimit ?? 5000,
            ),
        [chartConfig, health.data?.query.maxLimit],
    );

    const { data: fromDashboardData } = useDashboardQuery(
        fromDashboard ?? undefined,
    );

    const chartPagedQuery = useExplorerChartPagedQuery({
        enabled: isWarehousePaginatedTable && Boolean(tableName),
        projectUuid,
        tableName,
        metricQuery: computedMetricQuery,
        configuredPageSize,
        parameters,
        missingRequiredParameters,
        fromDashboard,
        dashboardContext: fromDashboardData
            ? {
                  dashboardSlug: fromDashboardData.slug,
                  dashboardName: fromDashboardData.name,
              }
            : undefined,
    });

    // Real total for showResultsTotal without pagination (do NOT enable paged query).
    // Pivot tables keep limit-based rowsCount; skip COUNT when warehouse pagination
    // already fetches count via chartPagedQuery.
    const showResultsTotalWithoutPagination = useMemo(() => {
        if (isWarehousePaginatedTable) {
            return false;
        }
        if (chartConfig.type !== ChartType.TABLE) {
            return false;
        }
        if (pivotConfig?.columns && pivotConfig.columns.length > 0) {
            return false;
        }
        const config = chartConfig.config;
        return isTableChartConfig(config) && Boolean(config.showResultsTotal);
    }, [chartConfig, isWarehousePaginatedTable, pivotConfig]);

    const resultsTotalCount = useCalculateCount({
        metricQuery: computedMetricQuery,
        explore: tableName,
        parameters,
        projectUuid,
        dashboardContext: fromDashboardData
            ? {
                  dashboardSlug: fromDashboardData.slug,
                  dashboardName: fromDashboardData.name,
              }
            : undefined,
        enabled: showResultsTotalWithoutPagination && Boolean(tableName),
    });

    const tablePagination = useMemo((): TablePaginationState | undefined => {
        if (chartPagedQuery.tablePagination) {
            return chartPagedQuery.tablePagination;
        }
        if (!showResultsTotalWithoutPagination) {
            return undefined;
        }
        return {
            enabled: false,
            totalRowCount: resultsTotalCount.data?.rowCount,
            isCountLoading:
                resultsTotalCount.data === undefined &&
                !resultsTotalCount.isError,
            isCountError: Boolean(resultsTotalCount.isError),
        };
    }, [
        chartPagedQuery.tablePagination,
        showResultsTotalWithoutPagination,
        resultsTotalCount.data,
        resultsTotalCount.isError,
    ]);

    const sharedResultsData = useMemo(
        () => ({
            ...queryResults,
            metricQuery: query.data?.metricQuery,
            fields: query.data?.fields,
        }),
        [query.data, queryResults],
    );

    const chartResultsData = useMemo(
        () => ({
            ...chartPagedQuery.queryResults,
            metricQuery: chartPagedQuery.query.data?.metricQuery,
            fields: chartPagedQuery.query.data?.fields,
        }),
        [chartPagedQuery.query.data, chartPagedQuery.queryResults],
    );

    const resultsData = isWarehousePaginatedTable
        ? chartResultsData
        : sharedResultsData;

    const isLoadingQueryResults = isWarehousePaginatedTable
        ? chartPagedQuery.isLoading
        : isLoading || queryResults.isFetchingRows;

    const unsavedChartVersion = useMemo(
        () => ({
            tableName,
            metricQuery,
            tableConfig: { columnOrder },
            chartConfig,
            pivotConfig,
        }),
        [tableName, metricQuery, columnOrder, chartConfig, pivotConfig],
    );

    const tableCalculationsMetadata = useExplorerContext(
        (context) => context.state.metadata?.tableCalculations,
    );

    const toggleSection = useCallback(
        () => toggleExpandedSection(ExplorerSection.VISUALIZATION),
        [toggleExpandedSection],
    );

    const { data: explore } = useExplore(unsavedChartVersion.tableName);

    const [echartsClickEvent, setEchartsClickEvent] =
        useState<EchartsClickEvent>();

    const openVisualizationConfig = useCallback(
        () => dispatch(explorerActions.openVisualizationConfig()),
        [dispatch],
    );
    const closeVisualizationConfig = useCallback(
        () => dispatch(explorerActions.closeVisualizationConfig()),
        [dispatch],
    );

    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useLayoutEffect(() => {
        if (isVisualizationConfigOpen) {
            const target = document.getElementById(VisualizationConfigPortalId);
            setPortalTarget(target);
        } else {
            setPortalTarget(null);
        }
    }, [isVisualizationConfigOpen]);

    useLayoutEffect(() => {
        if (!isEditMode) {
            closeVisualizationConfig();
        }
    }, [isEditMode, closeVisualizationConfig]);

    useLayoutEffect(() => {
        if (!isOpen) {
            closeVisualizationConfig();
        }
    }, [closeVisualizationConfig, isOpen]);

    const onSeriesContextMenu = useCallback(
        (e: EchartSeriesClickEvent, series: EChartSeries[]) => {
            setEchartsClickEvent({
                event: e,
                dimensions: unsavedChartVersion.metricQuery.dimensions,
                series,
            });
        },
        [unsavedChartVersion],
    );

    const apiErrorDetail = useMemo(() => {
        const queryError = isWarehousePaginatedTable
            ? (chartPagedQuery.query.error?.error ??
              chartPagedQuery.queryResults.error?.error)
            : (query.error?.error ?? queryResults.error?.error);

        return !missingRequiredParameters?.length
            ? queryError
            : // Mimicking an API Error Detail so it can be used in the EmptyState component
              ({
                  message: 'Missing required parameters',
                  name: 'Error',
                  statusCode: 400,
                  data: {},
              } satisfies ApiErrorDetail);
    }, [
        isWarehousePaginatedTable,
        chartPagedQuery.query.error?.error,
        chartPagedQuery.queryResults.error?.error,
        query.error?.error,
        queryResults.error?.error,
        missingRequiredParameters,
    ]);

    if (!unsavedChartVersion.tableName) {
        return (
            <CollapsableCard
                title={t('components_explorer_visualization_card.charts')}
                disabled
            />
        );
    }

    const getGsheetLink = async (
        exportColumnOrder: string[],
        showTableNames: boolean,
        customLabels?: Record<string, string>,
        hiddenFields?: string[],
        exportPivotConfig?: PivotConfig,
    ) => {
        if (explore?.name && unsavedChartVersion?.metricQuery && projectUuid) {
            const gsheetResponse = await uploadGsheet({
                projectUuid,
                exploreId: explore?.name,
                metricQuery: unsavedChartVersion?.metricQuery,
                columnOrder: exportColumnOrder,
                showTableNames,
                customLabels,
                hiddenFields,
                pivotConfig: exportPivotConfig,
            });
            return gsheetResponse;
        }
        throw new NotFoundError('no metric query defined');
    };

    if (health.isInitialLoading || !health.data) {
        return null;
    }

    return (
        <ErrorBoundary>
            <VisualizationProvider
                chartConfig={unsavedChartVersion.chartConfig}
                initialPivotDimensions={
                    unsavedChartVersion.pivotConfig?.columns
                }
                unsavedMetricQuery={unsavedChartVersion.metricQuery}
                resultsData={resultsData}
                apiErrorDetail={apiErrorDetail}
                isLoading={isLoadingQueryResults}
                columnOrder={unsavedChartVersion.tableConfig.columnOrder}
                onSeriesContextMenu={onSeriesContextMenu}
                pivotTableMaxColumnLimit={health.data.pivotTable.maxColumnLimit}
                savedChartUuid={isEditMode ? undefined : savedChart?.uuid}
                onChartConfigChange={setChartConfig}
                onChartTypeChange={setChartType}
                onPivotDimensionsChange={setPivotFields}
                colorPalette={org?.chartColors ?? ECHARTS_DEFAULT_COLORS}
                tableCalculationsMetadata={tableCalculationsMetadata}
                parameters={
                    isWarehousePaginatedTable
                        ? chartPagedQuery.query.data?.usedParametersValues
                        : query.data?.usedParametersValues
                }
                tablePagination={tablePagination}
            >
                <CollapsableCard
                    title={t('components_explorer_visualization_card.chart')}
                    isOpen={isOpen}
                    isVisualizationCard
                    onToggle={toggleSection}
                    headerElement={
                        isOpen && (
                            <Flex align="center" gap="sm">
                                <VisualizationWarning
                                    pivotDimensions={
                                        unsavedChartVersion.pivotConfig?.columns
                                    }
                                    chartConfig={
                                        unsavedChartVersion.chartConfig
                                    }
                                    resultsData={resultsData}
                                    isLoading={isLoadingQueryResults}
                                />
                            </Flex>
                        )
                    }
                    rightHeaderElement={
                        isOpen && (
                            <>
                                {isEditMode ? (
                                    <Button
                                        {...COLLAPSABLE_CARD_BUTTON_PROPS}
                                        onClick={
                                            isVisualizationConfigOpen
                                                ? closeVisualizationConfig
                                                : openVisualizationConfig
                                        }
                                        rightIcon={
                                            <MantineIcon
                                                icon={
                                                    isVisualizationConfigOpen
                                                        ? IconLayoutSidebarLeftCollapse
                                                        : IconLayoutSidebarLeftExpand
                                                }
                                            />
                                        }
                                    >
                                        {isVisualizationConfigOpen
                                            ? t(
                                                  'components_explorer_visualization_card.close_configure',
                                              )
                                            : t(
                                                  'components_explorer_visualization_card.configure',
                                              )}
                                    </Button>
                                ) : null}

                                {/*
                                 * NOTE: not using Portal from mantine-8 because this page lacks MantineProvider from Mantine 8
                                 * TODO: use mantine-8 portal with reuseTargetNode flag to avoid rendering additional divs
                                 */}
                                {portalTarget &&
                                    createPortal(
                                        <VisualizationConfig
                                            chartType={
                                                unsavedChartVersion.chartConfig
                                                    .type
                                            }
                                            onClose={closeVisualizationConfig}
                                        />,
                                        portalTarget,
                                    )}

                                <Can
                                    I="manage"
                                    this={subject('Explore', {
                                        organizationUuid: org?.organizationUuid,
                                        projectUuid,
                                    })}
                                >
                                    {!!projectUuid && (
                                        <ChartDownloadMenu
                                            getDownloadQueryUuid={
                                                getDownloadQueryUuid
                                            }
                                            projectUuid={projectUuid}
                                            chartName={savedChart?.name}
                                            getGsheetLink={getGsheetLink}
                                        />
                                    )}
                                </Can>
                            </>
                        )
                    }
                >
                    <LightdashVisualization
                        className="sentry-block ph-no-capture"
                        data-testid="visualization"
                    />
                    <SeriesContextMenu
                        echartSeriesClickEvent={echartsClickEvent?.event}
                        dimensions={echartsClickEvent?.dimensions}
                        series={echartsClickEvent?.series}
                        explore={explore}
                    />
                </CollapsableCard>
            </VisualizationProvider>
        </ErrorBoundary>
    );
});

export default VisualizationCard;
