import {
    DashboardTileTypes,
    defaultTileSize,
    type Dashboard,
} from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Modal,
    MultiSelect,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChartAreaLine } from '@tabler/icons-react';
import React, { forwardRef, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';

import { useChartSummaries } from '../../../hooks/useChartSummaries';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onClose: () => void;
};

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    description?: string;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    ({ label, description, ...others }: ItemProps, ref) => (
        <div ref={ref} {...others}>
            <Stack spacing="two">
                <Tooltip
                    label={description}
                    disabled={!description}
                    position="top-start"
                >
                    <Text>{label}</Text>
                </Tooltip>
            </Stack>
        </div>
    ),
);

const AddChartTilesModal: FC<Props> = ({ onAddTiles, onClose }) => {
    const { t } = useTranslation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isInitialLoading } =
        useChartSummaries(projectUuid);

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const form = useForm({
        initialValues: {
            savedChartsUuids: [],
        },
    });
    const allSavedCharts = useMemo(() => {
        const reorderedCharts = savedCharts?.sort((chartA, chartB) =>
            chartA.spaceUuid === dashboard?.spaceUuid
                ? -1
                : chartB.spaceUuid === dashboard?.spaceUuid
                ? 1
                : 0,
        );
        return (reorderedCharts || []).map(({ uuid, name, spaceName }) => {
            const alreadyAddedChart = dashboardTiles?.find((tile) => {
                return (
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.savedChartUuid === uuid
                );
            });

            return {
                value: uuid,
                label: name,
                group: spaceName,
                description: alreadyAddedChart
                    ? t(
                          'components_dashboard_tiles_forms_add_chart.already_added_chart',
                      )
                    : undefined,
            };
        });
    }, [dashboardTiles, savedCharts, dashboard?.spaceUuid, t]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.map((uuid) => {
                const chart = savedCharts?.find((c) => c.uuid === uuid);
                return {
                    uuid: uuid4(),
                    properties: {
                        savedChartUuid: uuid,
                        chartName: chart?.name ?? '',
                    },
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    ...defaultTileSize,
                };
            }),
        );
        onClose();
    });

    if (!savedCharts || !dashboardTiles || isInitialLoading) return null;

    return (
        <Modal
            size="lg"
            opened={true}
            onClose={onClose}
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon
                        icon={IconChartAreaLine}
                        size="lg"
                        color="blue.8"
                    />

                    <Title order={4}>
                        {t(
                            'components_dashboard_tiles_forms_add_chart.add_saved_charts',
                        )}
                    </Title>
                </Flex>
            }
            withCloseButton
            closeOnClickOutside={false}
        >
            <Stack spacing="md">
                <form
                    id="add-saved-charts-to-dashboard"
                    onSubmit={handleSubmit}
                >
                    <MultiSelect
                        styles={(theme) => ({
                            separator: {
                                position: 'sticky',
                                top: 0,
                                backgroundColor: 'white',
                            },
                            separatorLabel: {
                                color: theme.colors.gray[6],
                                fontWeight: 500,
                            },
                        })}
                        id="saved-charts"
                        label={t(
                            'components_dashboard_tiles_forms_add_chart.form.saved_charts.label',
                        )}
                        data={allSavedCharts}
                        disabled={isInitialLoading}
                        defaultValue={[]}
                        placeholder={t(
                            'components_dashboard_tiles_forms_add_chart.form.saved_charts.placeholder',
                        )}
                        required
                        searchable
                        withinPortal
                        itemComponent={SelectItem}
                        {...form.getInputProps('savedChartsUuids')}
                    />
                    <Group spacing="xs" position="right" mt="md">
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
                            }}
                            variant="outline"
                        >
                            {t(
                                'components_dashboard_tiles_forms_add_chart.form.cancel',
                            )}
                        </Button>
                        <Button type="submit" disabled={isInitialLoading}>
                            {t(
                                'components_dashboard_tiles_forms_add_chart.form.add',
                            )}
                        </Button>
                    </Group>
                </form>
            </Stack>
        </Modal>
    );
};

export default AddChartTilesModal;
