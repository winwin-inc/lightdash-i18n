import { FeatureFlags, type Dashboard } from '@lightdash/common';
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
    IconCsv,
    IconFileExport,
    IconHelpCircle,
    IconLayoutDashboard,
    IconScreenshot,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { PreviewAndCustomizeScreenshot } from '../../../features/preview';
import { useCustomWidthOptions } from '../../../features/scheduler/constants';
import {
    useExportCsvDashboard,
    useExportDashboard,
} from '../../../hooks/dashboard/useDashboard';
import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../MantineIcon';

type Props = {
    gridWidth: number;
    dashboard: Dashboard;
};

type CsvExportProps = {
    dashboard: Dashboard;
};

const CsvExport: FC<CsvExportProps & Pick<ModalProps, 'onClose'>> = ({
    dashboard,
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
                <Alert title="Date zoom is enabled" color="blue" mb="md">
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
                            onClick={() => {
                                exportCsvDashboardMutation.mutate({
                                    dashboard,
                                    filters: dashboardFilters,
                                    dateZoomGranularity: dateZoomGranularity,
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

const ImageExport: FC<Props & Pick<ModalProps, 'onClose'>> = ({
    onClose,
    gridWidth,
    dashboard,
}) => {
    const { t } = useTranslation();
    const customWidthOptions = useCustomWidthOptions();

    const [previews, setPreviews] = useState<Record<string, string>>({});
    const [previewChoice, setPreviewChoice] = useState<
        typeof customWidthOptions[number]['value'] | undefined
    >(customWidthOptions[1].value);
    const location = useLocation();
    const exportDashboardMutation = useExportDashboard();

    const isDashboardTabsEnabled = useFeatureFlagEnabled(
        FeatureFlags.DashboardTabs,
    );
    const isDashboardTabsAvailable =
        dashboard?.tabs !== undefined && dashboard.tabs.length > 0;

    const [allTabsSelected, setAllTabsSelected] = useState(true);
    const [selectedTabs, setSelectedTabs] = useState<string[]>(
        dashboard?.tabs?.map((tab) => tab.uuid) || [],
    );

    // Check if the selected tabs have tiles so we can disable the export button if not
    const hasTilesInSelectedTabs = useCallback(() => {
        if (allTabsSelected) {
            return dashboard.tiles.length > 0;
        }
        return dashboard.tiles.some((tile) =>
            selectedTabs.includes(tile.tabUuid || ''),
        );
    }, [allTabsSelected, dashboard.tiles, selectedTabs]);

    // Helper function to create consistent cache keys
    const getPreviewKey = useCallback(
        (width: string) => {
            return `${width}-${selectedTabs.join('-')}`;
        },
        [selectedTabs],
    );

    // Get the current preview based on the key
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
                isDashboardTabsEnabled &&
                isDashboardTabsAvailable &&
                !allTabsSelected
                    ? selectedTabs
                    : undefined,
        });
    }, [
        previewChoice,
        previews,
        getPreviewKey,
        exportDashboardMutation,
        location.search,
        dashboard,
        isDashboardTabsEnabled,
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
                isDashboardTabsEnabled &&
                isDashboardTabsAvailable &&
                !allTabsSelected
                    ? selectedTabs
                    : undefined,
        });

        // Store the preview with the proper key
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
        isDashboardTabsEnabled,
        isDashboardTabsAvailable,
        allTabsSelected,
        selectedTabs,
        getPreviewKey,
    ]);

    return (
        <Stack>
            <Stack spacing="xs" px="md">
                {isDashboardTabsEnabled && isDashboardTabsAvailable && (
                    <Stack spacing="xs">
                        <Input.Label>
                            <Group spacing="xs">
                                Tabs
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
                                    setSelectedTabs([
                                        dashboard?.tabs?.[0]?.uuid,
                                    ]);
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
    const [exportType, setExportType] = useState<string>('image');

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
                            Export dashboard
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <SegmentedControl
                    ml="md"
                    mt="xs"
                    data={[
                        {
                            label: 'Image',
                            value: 'image',
                        },
                        {
                            label: '.csv',
                            value: 'csv',
                        },
                    ]}
                    w="min-content"
                    mb="xs"
                    defaultValue="image"
                    onChange={setExportType}
                />
                {exportType === 'csv' && (
                    <CsvExport dashboard={dashboard} onClose={onClose} />
                )}

                {exportType === 'image' && (
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
