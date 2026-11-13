import {
    DownloadFileType,
    SchedulerFormat,
    type Dashboard,
    type DashboardFilters,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Group,
    Input,
    Modal,
    MultiSelect,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import {
    IconFileExport,
    IconHelpCircle,
    IconLayoutDashboard,
    IconScreenshot,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { prepareDashboardFilterRuleForQuery } from '../Filters/FilterInputs/utils';

import ExportOptions from '../../ExportResults/ExportOptions';
import { Limit, Values } from '../../ExportResults/types';
import { PreviewAndCustomizeScreenshot } from '../../../features/preview';
import { useExportLimitDefaults } from '../../ExportResults/useExportLimitDefaults';
import { useCustomWidthOptions } from '../../../features/scheduler/constants';
import useHealth from '../../../hooks/health/useHealth';
import {
    useExportDashboard,
    useExportDashboardContent,
} from '../../../hooks/dashboard/useDashboard';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../MantineIcon';

type Props = {
    gridWidth: number;
    dashboard: Dashboard;
};

type ExportTabsSelection = {
    allTabsSelected: boolean;
    setAllTabsSelected: (value: boolean) => void;
    selectedTabs: string[];
    setSelectedTabs: (value: string[]) => void;
};

type DataExportProps = {
    dashboard: Dashboard;
    /** null 表示导出全部 Tab */
    selectedTabs: string[] | null;
    hasTilesInSelectedTabs: boolean;
    /** 每个 Tab 实际生效的筛选器（已合并全局 + Tab），键为 tabUuid */
    tabFilters: Record<string, DashboardFilters>;
};

/** 导出前把筛选规则整理成查询可用形态：解析动态日期、钳制固定区间 */
const prepareTabFilters = (merged: DashboardFilters): DashboardFilters => ({
    dimensions: merged.dimensions.map((rule) =>
        prepareDashboardFilterRuleForQuery(rule),
    ),
    metrics: merged.metrics.map((rule) =>
        prepareDashboardFilterRuleForQuery(rule),
    ),
    tableCalculations: merged.tableCalculations.map((rule) =>
        prepareDashboardFilterRuleForQuery(rule),
    ),
});

const hasTilesInTabs = (
    dashboard: Dashboard,
    allTabsSelected: boolean,
    selectedTabs: string[],
) => {
    if (allTabsSelected) {
        return dashboard.tiles.length > 0;
    }
    return dashboard.tiles.some((tile) =>
        selectedTabs.includes(tile.tabUuid || ''),
    );
};

/** 看板导出的 Tab 选择；数据导出共用，默认全选 */
const ExportTabsPicker: FC<{
    dashboard: Dashboard;
    selection: ExportTabsSelection;
}> = ({ dashboard, selection }) => {
    const { t } = useTranslation();
    const {
        allTabsSelected,
        setAllTabsSelected,
        selectedTabs,
        setSelectedTabs,
    } = selection;

    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 0;
    if (!isDashboardTabsAvailable) {
        return null;
    }

    return (
        <Stack spacing="xs">
            <Input.Label>
                <Group spacing="xs">
                    {t('components_common_modal_dashboard_export.tabs_label')}
                    <Tooltip
                        withinPortal={true}
                        maw={400}
                        variant="xs"
                        multiline
                        label={t(
                            'components_common_modal_dashboard_export.select_all_tabs_tooltip',
                        )}
                    >
                        <MantineIcon
                            icon={IconHelpCircle}
                            size="md"
                            display="inline"
                            color="gray"
                        />
                    </Tooltip>
                </Group>
            </Input.Label>
            <Checkbox
                size="sm"
                label={t(
                    'components_common_modal_dashboard_export.include_all_tabs',
                )}
                labelPosition="right"
                checked={allTabsSelected}
                onChange={(e) => {
                    setAllTabsSelected(e.target.checked);
                    if (e.target.checked) {
                        setSelectedTabs(
                            dashboard?.tabs?.map((tab) => tab.uuid) || [],
                        );
                    } else {
                        const firstTabUuid = dashboard?.tabs?.[0]?.uuid;
                        setSelectedTabs(firstTabUuid ? [firstTabUuid] : []);
                    }
                }}
            />
            {!allTabsSelected && (
                <MultiSelect
                    placeholder={t(
                        'components_common_modal_dashboard_export.select_tabs',
                    )}
                    value={selectedTabs}
                    data={(dashboard?.tabs || []).map((tab) => ({
                        value: tab.uuid,
                        label: tab.name,
                    }))}
                    clearable={selectedTabs.length > 1}
                    searchable
                    onChange={setSelectedTabs}
                    required
                    error={
                        !hasTilesInTabs(dashboard, allTabsSelected, selectedTabs)
                            ? t(
                                  'components_common_modal_dashboard_export.no_tiles_in_selected_tabs',
                              )
                            : undefined
                    }
                />
            )}
        </Stack>
    );
};

/** 数据导出：选 Tab → 选格式/值/限制 → 取消/下载；CSV 与 XLSX 都走 /dashboards/:uuid/exports */
const DataExport: FC<DataExportProps & Pick<ModalProps, 'onClose'>> = ({
    dashboard,
    selectedTabs,
    hasTilesInSelectedTabs,
    tabFilters,
    onClose,
}) => {
    const { t, i18n } = useTranslation();
    const exportContentMutation = useExportDashboardContent();
    const dashboardFilters = useDashboardContext((c) => c.allFilters);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const health = useHealth();

    const [fileType, setFileType] = useState<DownloadFileType>(
        DownloadFileType.XLSX,
    );
    const [values, setValues] = useState<Values>(Values.FORMATTED);
    // 默认限制与「导出数据」一致：client-use 且无 ChangeCsvResults 权限时为全部结果
    const { defaultLimit } = useExportLimitDefaults(dashboard.projectUuid);
    const [limit, setLimit] = useState<Limit>(defaultLimit);
    const [customLimit, setCustomLimit] = useState<number>(1);

    useEffect(() => {
        setLimit(defaultLimit);
    }, [defaultLimit]);

    const csvCellsLimit = health.data?.query?.csvCellsLimit || 100000;
    // 整次导出的累计行数上限（来自后端配置），「所有结果」提示里要说清楚
    const dashboardExportMaxTotalRows =
        health.data?.query?.dashboardExportMaxTotalRows;

    const handleExport = () => {
        exportContentMutation.mutate({
            dashboard,
            request: {
                format:
                    fileType === DownloadFileType.CSV
                        ? SchedulerFormat.CSV
                        : SchedulerFormat.XLSX,
                options: {
                    formatted: values === Values.FORMATTED,
                    limit:
                        limit === Limit.TABLE
                            ? 'table'
                            : limit === Limit.ALL
                              ? 'all'
                              : customLimit,
                    // 后端按 locale 决定筛选器列的用词与兜底文案
                    locale: i18n.language?.toLowerCase().startsWith('zh')
                        ? 'zh'
                        : 'en',
                },
                dashboardFilters,
                dateZoomGranularity,
                selectedTabs,
                parameters: parameterValues,
                tabFilters,
            },
        });
        onClose();
    };

    return (
        <Stack p="md" pt="sm" spacing="md">
            {!!dateZoomGranularity && (
                <Alert
                    title={t(
                        'components_common_modal_dashboard_export.alert_title',
                    )}
                    color="blue"
                >
                    {t('components_common_modal_dashboard_export.alert')}
                </Alert>
            )}
            <ExportOptions
                projectUuid={dashboard.projectUuid}
                fileType={fileType}
                onFileTypeChange={setFileType}
                values={values}
                onValuesChange={setValues}
                limit={limit}
                onLimitChange={setLimit}
                customLimit={customLimit}
                onCustomLimitChange={setCustomLimit}
            />
            <Alert color="gray" p="xs">
                <Text size="xs">
                    {limit === Limit.TABLE
                        ? t(
                              'components_common_modal_dashboard_export.table_limit_hint',
                          )
                        : t(
                              'components_common_modal_dashboard_export.total_row_limit_hint',
                              {
                                  rows: (
                                      dashboardExportMaxTotalRows ?? 200000
                                  ).toLocaleString(),
                                  csvCellsLimit: csvCellsLimit.toLocaleString(),
                              },
                          )}
                </Text>
            </Alert>
            <Group position="right" spacing="sm" pt="xs">
                <Button variant="outline" onClick={onClose}>
                    {t('components_common_modal_dashboard_export.cancel')}
                </Button>
                <Button
                    onClick={handleExport}
                    disabled={!hasTilesInSelectedTabs}
                    leftIcon={<MantineIcon icon={IconFileExport} />}
                >
                    {t('components_export_results.download')}
                </Button>
            </Group>
        </Stack>
    );
};

const ImageExport: FC<Props & Pick<ModalProps, 'onClose'>> = ({
    onClose,
    gridWidth,
    dashboard,
}) => {
    const { t } = useTranslation();
    const customWidthOptions = useCustomWidthOptions();

    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<
        (typeof customWidthOptions)[number]['value'] | undefined
    >(customWidthOptions[1].value);
    const location = useLocation();
    const exportDashboardMutation = useExportDashboard();

    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 0;

    const [allTabsSelected, setAllTabsSelected] = useState(true);
    const [selectedTabs, setSelectedTabs] = useState<string[]>(
        dashboard?.tabs?.map((tab) => tab.uuid) || [],
    );

    const hasTilesInSelectedTabs = useCallback(() => {
        if (allTabsSelected) {
            return dashboard.tiles.length > 0;
        }
        return dashboard.tiles.some((tile) =>
            selectedTabs.includes(tile.tabUuid || ''),
        );
    }, [allTabsSelected, dashboard.tiles, selectedTabs]);

    const getPreviewKey = useCallback(
        (width: string) => {
            return `${width}-${selectedTabs.join('-')}`;
        },
        [selectedTabs],
    );

    const currentPreview = previewChoice
        ? previews[getPreviewKey(previewChoice)]
        : undefined;

    const handleExportClick = useCallback(() => {
        if (previewChoice && previews[getPreviewKey(previewChoice)]) {
            return window.open(
                previews[getPreviewKey(previewChoice)],
                '_blank',
            );
        }

        const queryParams = new URLSearchParams(location.search);

        exportDashboardMutation.mutate({
            dashboard,
            gridWidth: undefined,
            queryFilters: `?${queryParams.toString()}`,
            selectedTabs:
                isDashboardTabsAvailable &&
                !allTabsSelected &&
                selectedTabs.length > 0
                    ? selectedTabs
                    : null,
        });
    }, [
        previewChoice,
        previews,
        getPreviewKey,
        exportDashboardMutation,
        location.search,
        dashboard,
        isDashboardTabsAvailable,
        allTabsSelected,
        selectedTabs,
    ]);

    const handlePreviewClick = useCallback(async () => {
        const queryParams = new URLSearchParams(location.search);

        const url = await exportDashboardMutation.mutateAsync({
            dashboard,
            gridWidth: previewChoice ? parseInt(previewChoice) : undefined,
            queryFilters: `?${queryParams.toString()}`,
            isPreview: true,
            selectedTabs:
                isDashboardTabsAvailable &&
                !allTabsSelected &&
                selectedTabs.length > 0
                    ? selectedTabs
                    : null,
        });

        if (previewChoice) {
            const key = getPreviewKey(previewChoice);
            setPreviews((prev) => ({
                ...prev,
                [key]: url,
            }));
        }
    }, [
        location.search,
        exportDashboardMutation,
        dashboard,
        previewChoice,
        isDashboardTabsAvailable,
        allTabsSelected,
        selectedTabs,
        getPreviewKey,
    ]);

    return (
        <Stack>
            <Stack spacing="xs" px="md">
                {isDashboardTabsAvailable && (
                    <Stack spacing="xs">
                        <Input.Label>
                            <Group spacing="xs">
                                {t(
                                    'components_common_modal_dashboard_export.tabs_label',
                                )}
                                <Tooltip
                                    withinPortal={true}
                                    maw={400}
                                    variant="xs"
                                    multiline
                                    label={t(
                                        'components_common_modal_dashboard_export.select_all_tabs_tooltip',
                                    )}
                                >
                                    <MantineIcon
                                        icon={IconHelpCircle}
                                        size="md"
                                        display="inline"
                                        color="gray"
                                    />
                                </Tooltip>
                            </Group>
                        </Input.Label>
                        <Checkbox
                            size="sm"
                            label={t(
                                'components_common_modal_dashboard_export.include_all_tabs',
                            )}
                            labelPosition="right"
                            checked={allTabsSelected}
                            onChange={(e) => {
                                setAllTabsSelected(e.target.checked);
                                if (e.target.checked) {
                                    setSelectedTabs(
                                        dashboard?.tabs?.map(
                                            (tab) => tab.uuid,
                                        ) || [],
                                    );
                                } else {
                                    const firstTabUuid =
                                        dashboard?.tabs?.[0]?.uuid;
                                    setSelectedTabs(
                                        firstTabUuid ? [firstTabUuid] : [],
                                    );
                                }
                            }}
                        />
                        {!allTabsSelected && (
                            <MultiSelect
                                placeholder={t(
                                    'components_common_modal_dashboard_export.select_tabs',
                                )}
                                value={selectedTabs}
                                data={(dashboard?.tabs || []).map((tab) => ({
                                    value: tab.uuid,
                                    label: tab.name,
                                }))}
                                clearButtonProps={{
                                    style: {
                                        display:
                                            selectedTabs.length > 1
                                                ? 'block'
                                                : 'none',
                                    },
                                }}
                                clearable={selectedTabs.length > 1}
                                searchable
                                onChange={setSelectedTabs}
                                required
                                error={
                                    !hasTilesInSelectedTabs()
                                        ? t(
                                              'components_common_modal_dashboard_export.no_tiles_in_selected_tabs',
                                          )
                                        : undefined
                                }
                            />
                        )}
                    </Stack>
                )}

                <PreviewAndCustomizeScreenshot
                    containerWidth={gridWidth}
                    exportMutation={exportDashboardMutation}
                    previewChoice={previewChoice}
                    setPreviewChoice={setPreviewChoice}
                    onPreviewClick={handlePreviewClick}
                    currentPreview={currentPreview}
                    disabled={!hasTilesInSelectedTabs()}
                />
            </Stack>

            <Box
                sx={(theme) => ({
                    borderTop: `1px solid ${theme.colors.gray[2]}`,
                    padding: theme.spacing.sm,
                    backgroundColor: theme.white,
                    position: 'sticky',
                    bottom: 0,
                    width: '100%',
                    zIndex: 10,
                })}
            >
                <Group position="right" spacing="lg">
                    <Button variant="outline" onClick={onClose}>
                        {t('components_common_modal_dashboard_export.cancel')}
                    </Button>

                    <Group spacing="xs">
                        <Button
                            loading={exportDashboardMutation.isLoading}
                            onClick={handleExportClick}
                            disabled={!hasTilesInSelectedTabs()}
                            leftIcon={
                                <MantineIcon
                                    icon={
                                        previewChoice
                                            ? IconScreenshot
                                            : IconFileExport
                                    }
                                />
                            }
                        >
                            {t(
                                'components_common_modal_dashboard_export.export_dashboard',
                            )}
                        </Button>
                    </Group>
                </Group>
            </Box>
        </Stack>
    );
};

export const DashboardExportModal: FC<Props & ModalProps> = ({
    opened,
    onClose,
    gridWidth,
    dashboard,
}) => {
    const { t } = useTranslation();
    const health = useHealth();
    // 图片 / PDF 导出依赖 headless browser；实例未启用时直接展示数据导出，不要顶层页签
    const hasHeadlessBrowser = health.data?.hasHeadlessBrowser ?? false;
    const [exportType, setExportType] = useState<string>('data');

    // Tab 选择在弹窗层维护，数据导出共用，默认全选
    const [allTabsSelected, setAllTabsSelected] = useState(true);
    const [selectedTabs, setSelectedTabs] = useState<string[]>(
        dashboard?.tabs?.map((tab) => tab.uuid) || [],
    );
    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 0;
    // 后端约定：null = 全部 Tab
    const resolvedSelectedTabs =
        !isDashboardTabsAvailable || allTabsSelected || selectedTabs.length === 0
            ? null
            : selectedTabs;
    const hasTilesInSelectedTabs = hasTilesInTabs(
        dashboard,
        allTabsSelected,
        selectedTabs,
    );

    // 每个 Tab 实际生效的筛选器（已合并全局 + Tab，含临时改动），数据导出共用；
    // 规则在导出前解析动态日期并钳制固定区间。
    // 只带本次要导出的 Tab，避免整份筛选器（含 tileTargets）白占任务载荷
    const getMergedFiltersForTab = useDashboardContext(
        (c) => c.getMergedFiltersForTab,
    );
    const tabFilters = useMemo(() => {
        const result: Record<string, DashboardFilters> = {};
        (dashboard.tabs ?? [])
            .filter(
                (tab) =>
                    resolvedSelectedTabs === null ||
                    resolvedSelectedTabs.includes(tab.uuid),
            )
            .forEach((tab) => {
                result[tab.uuid] = prepareTabFilters(
                    getMergedFiltersForTab(tab.uuid),
                );
            });
        return result;
    }, [dashboard.tabs, getMergedFiltersForTab, resolvedSelectedTabs]);

    return (
        <Modal.Root
            opened={opened}
            onClose={onClose}
            // 数据导出只有少量控件，窄一点更聚焦；图片导出要放预览，保留宽度
            size={exportType === 'image' ? 'xl' : 560}
            centered
        >
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: theme.spacing.sm,
                    })}
                >
                    <Group spacing="xs">
                        <Paper p="xs" withBorder radius="sm">
                            <MantineIcon icon={IconLayoutDashboard} size="sm" />
                        </Paper>
                        <Text color="dark.7" fw={700} fz="md">
                            {t(
                                'components_common_modal_dashboard_export.export_dashboard',
                            )}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                {hasHeadlessBrowser && (
                    <SegmentedControl
                        mx="md"
                        mt="sm"
                        data={[
                            {
                                label: t(
                                    'components_common_modal_dashboard_export.tabs.image',
                                ),
                                value: 'image',
                            },
                            {
                                label: t(
                                    'components_common_modal_dashboard_export.tabs.data',
                                ),
                                value: 'data',
                            },
                        ]}
                        w="min-content"
                        value={exportType}
                        onChange={(value) => setExportType(value ?? 'data')}
                    />
                )}
                {exportType === 'image' && hasHeadlessBrowser ? (
                    <ImageExport
                        dashboard={dashboard}
                        onClose={onClose}
                        gridWidth={gridWidth}
                    />
                ) : (
                    <>
                        {isDashboardTabsAvailable && (
                            <Box px="md" pt="md">
                                <ExportTabsPicker
                                    dashboard={dashboard}
                                    selection={{
                                        allTabsSelected,
                                        setAllTabsSelected,
                                        selectedTabs,
                                        setSelectedTabs,
                                    }}
                                />
                            </Box>
                        )}
                        <DataExport
                            dashboard={dashboard}
                            selectedTabs={resolvedSelectedTabs}
                            hasTilesInSelectedTabs={hasTilesInSelectedTabs}
                            tabFilters={tabFilters}
                            onClose={onClose}
                        />
                    </>
                )}
            </Modal.Content>
        </Modal.Root>
    );
};
