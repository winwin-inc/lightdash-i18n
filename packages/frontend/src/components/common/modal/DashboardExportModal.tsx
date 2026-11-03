import {
    SchedulerFormat,
    type Dashboard,
    type SchedulerCsvOptions,
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
    Radio,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import {
    IconCsv,
    IconFileExport,
    IconFileTypeXls,
    IconHelpCircle,
    IconLayoutDashboard,
    IconScreenshot,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { PreviewAndCustomizeScreenshot } from '../../../features/preview';
import { useCustomWidthOptions } from '../../../features/scheduler/constants';
import useHealth from '../../../hooks/health/useHealth';
import {
    useExportCsvDashboard,
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

type CsvExportProps = {
    dashboard: Dashboard;
    /** null 表示导出全部 Tab */
    selectedTabs: string[] | null;
    hasTilesInSelectedTabs: boolean;
};

type XlsxExportProps = {
    dashboard: Dashboard;
    selectedTabs: string[] | null;
    hasTilesInSelectedTabs: boolean;
};

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

/** 看板导出的 Tab 选择；CSV / XLSX 共用，默认全选 */
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

const CsvExport: FC<CsvExportProps & Pick<ModalProps, 'onClose'>> = ({
    dashboard,
    selectedTabs,
    hasTilesInSelectedTabs,
    onClose,
}) => {
    const { t } = useTranslation();
    const exportCsvDashboardMutation = useExportCsvDashboard();
    const dashboardFilters = useDashboardContext((c) => c.allFilters);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );

    return (
        <Stack p="md">
            {!!dateZoomGranularity && (
                <Alert
                    title={t(
                        'components_common_modal_dashboard_export.alert_title',
                    )}
                    color="blue"
                    mb="md"
                >
                    {t('components_common_modal_dashboard_export.alert')}
                </Alert>
            )}
            <Group position="right" spacing="lg">
                <Button variant="outline" onClick={onClose}>
                    {t('components_common_modal_dashboard_export.cancel')}
                </Button>

                <Group spacing="xs">
                    <Tooltip
                        withinPortal
                        position="bottom"
                        label={t(
                            'components_common_modal_dashboard_export.tooltip.label',
                        )}
                    >
                        <Button
                            disabled={!hasTilesInSelectedTabs}
                            onClick={() => {
                                exportCsvDashboardMutation.mutate({
                                    dashboard,
                                    filters: dashboardFilters,
                                    dateZoomGranularity: dateZoomGranularity,
                                    selectedTabs,
                                });
                                onClose();
                            }}
                            leftIcon={<MantineIcon icon={IconCsv} />}
                        >
                            {t(
                                'components_common_modal_dashboard_export.tooltip.button',
                            )}
                        </Button>
                    </Tooltip>
                </Group>
            </Group>
        </Stack>
    );
};

const XlsxExport: FC<XlsxExportProps & Pick<ModalProps, 'onClose'>> = ({
    dashboard,
    selectedTabs,
    hasTilesInSelectedTabs,
    onClose,
}) => {
    const { t } = useTranslation();
    const exportContentMutation = useExportDashboardContent();
    const dashboardFilters = useDashboardContext((c) => c.allFilters);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);

    const [xlsxFileLayout, setXlsxFileLayout] =
        useState<NonNullable<SchedulerCsvOptions['xlsxFileLayout']>>('zip');

    const handleExport = () => {
        exportContentMutation.mutate({
            dashboard,
            request: {
                format: SchedulerFormat.XLSX,
                options: {
                    formatted: true,
                    limit: 'table',
                    xlsxFileLayout,
                },
                dashboardFilters,
                dateZoomGranularity,
                selectedTabs,
                parameters: parameterValues,
            },
        });
        onClose();
    };

    return (
        <Stack p="md" spacing="md">
            <Radio.Group
                label={t(
                    'features_scheduler_form.form.tabs_panel_setup.xlsx_output',
                )}
                description={t(
                    'features_scheduler_form.form.tabs_panel_setup.xlsx_output_help',
                )}
                value={xlsxFileLayout}
                onChange={(value) =>
                    setXlsxFileLayout(
                        value as NonNullable<
                            SchedulerCsvOptions['xlsxFileLayout']
                        >,
                    )
                }
            >
                <Stack spacing="xxs" pt="xs">
                    <Radio
                        label={t(
                            'features_scheduler_form.form.tabs_panel_setup.xlsx_zip',
                        )}
                        value="zip"
                    />
                    <Radio
                        label={t(
                            'features_scheduler_form.form.tabs_panel_setup.xlsx_workbook',
                        )}
                        value="workbook"
                    />
                </Stack>
            </Radio.Group>

            <Group position="right" spacing="lg">
                <Button variant="outline" onClick={onClose}>
                    {t('components_common_modal_dashboard_export.cancel')}
                </Button>
                <Button
                    onClick={handleExport}
                    disabled={!hasTilesInSelectedTabs}
                    leftIcon={<MantineIcon icon={IconFileTypeXls} />}
                >
                    {t(
                        'components_common_modal_dashboard_export.tooltip.button_xlsx',
                    )}
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
    // 图片 / PDF 导出依赖 headless browser；实例未启用时直接不展示该页签
    const hasHeadlessBrowser = health.data?.hasHeadlessBrowser ?? false;
    const [exportType, setExportType] = useState<string>('xlsx');

    // Tab 选择在弹窗层维护，CSV / XLSX 共用，默认全选
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

    return (
        <Modal.Root opened={opened} onClose={onClose} size="xl" yOffset="3vh">
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    maxWidth: '800px',
                    margin: '0 auto',
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

                <SegmentedControl
                    ml="md"
                    mt="xs"
                    data={[
                        ...(hasHeadlessBrowser
                            ? [
                                  {
                                      label: t(
                                          'components_common_modal_dashboard_export.tabs.image',
                                      ),
                                      value: 'image',
                                  },
                              ]
                            : []),
                        {
                            label: t(
                                'components_common_modal_dashboard_export.tabs.csv',
                            ),
                            value: 'csv',
                        },
                        {
                            label: t(
                                'components_common_modal_dashboard_export.tabs.xlsx',
                            ),
                            value: 'xlsx',
                        },
                    ]}
                    w="min-content"
                    mb="xs"
                    value={exportType}
                    onChange={(value) => setExportType(value ?? 'xlsx')}
                />
                {exportType !== 'image' && isDashboardTabsAvailable && (
                    <Box px="md">
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
                {exportType === 'csv' && (
                    <CsvExport
                        dashboard={dashboard}
                        selectedTabs={resolvedSelectedTabs}
                        hasTilesInSelectedTabs={hasTilesInSelectedTabs}
                        onClose={onClose}
                    />
                )}
                {exportType === 'xlsx' && (
                    <XlsxExport
                        dashboard={dashboard}
                        selectedTabs={resolvedSelectedTabs}
                        hasTilesInSelectedTabs={hasTilesInSelectedTabs}
                        onClose={onClose}
                    />
                )}
                {exportType === 'image' && hasHeadlessBrowser && (
                    <ImageExport
                        dashboard={dashboard}
                        onClose={onClose}
                        gridWidth={gridWidth}
                    />
                )}
            </Modal.Content>
        </Modal.Root>
    );
};
