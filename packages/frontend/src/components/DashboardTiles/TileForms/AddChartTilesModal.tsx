import {
    ChartKind,
    ChartSourceType,
    DashboardTileTypes,
    assertUnreachable,
    defaultTileSize,
    type ChartContent,
    type Dashboard,
} from '@lightdash/common';
import {
    Button,
    Flex,
    Group,
    Loader,
    Modal,
    MultiSelect,
    ScrollArea,
    Stack,
    Text,
    Title,
    Tooltip,
    getDefaultZIndex,
    type ScrollAreaProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconChartAreaLine } from '@tabler/icons-react';
import uniqBy from 'lodash/uniqBy';
import React, {
    forwardRef,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { v4 as uuid4 } from 'uuid';

import { useChartSummariesV2 } from '../../../hooks/useChartSummariesV2';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../../common/MantineIcon';
import { ChartIcon } from '../../common/ResourceIcon';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onClose: () => void;
};

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
    label: string;
    chartKind: ChartKind;
    tooltipLabel?: string;
    disabled?: boolean;
    selected?: boolean;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
    (
        {
            label,
            tooltipLabel,
            chartKind,
            disabled,
            selected,
            ...others
        }: ItemProps,
        ref,
    ) => (
        <div ref={ref} {...others}>
            <Stack spacing="one">
                <Tooltip
                    label={tooltipLabel}
                    disabled={!tooltipLabel}
                    position="top-start"
                    withinPortal
                >
                    <Group spacing="xs">
                        <ChartIcon
                            chartKind={chartKind ?? ChartKind.VERTICAL_BAR}
                            color={disabled ? 'gray.5' : undefined}
                        />
                        <Text
                            c={
                                disabled
                                    ? 'dimmed'
                                    : selected
                                    ? 'gray.0'
                                    : 'gray.8'
                            }
                            fw={500}
                            fz="xs"
                        >
                            {label}
                        </Text>
                    </Group>
                </Tooltip>
            </Stack>
        </div>
    ),
);

const AddChartTilesModal: FC<Props> = ({ onAddTiles, onClose }) => {
    const { t } = useTranslation();

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const selectScrollRef = useRef<HTMLDivElement>(null);
    const {
        data: chartPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useChartSummariesV2(
        {
            projectUuid,
            page: 1,
            pageSize: 25,
            search: debouncedSearchQuery,
        },
        { keepPreviousData: true },
    );
    useEffect(() => {
        selectScrollRef.current?.scrollTo({
            top: selectScrollRef.current?.scrollHeight,
        });
    }, [chartPages]);
    // Aggregates all fetched charts across pages and search queries into a unified list.
    // This ensures that previously fetched chart are preserved even when the search query changes.
    // Uses 'uuid' to remove duplicates and maintain a consistent set of unique charts.
    const [savedQueries, setSavedQueries] = useState<ChartContent[]>([]);
    useEffect(() => {
        const allPages = chartPages?.pages.map((p) => p.data).flat() ?? [];

        setSavedQueries((previousState) =>
            uniqBy([...previousState, ...allPages], 'uuid'),
        );
    }, [chartPages?.pages]);

    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboard = useDashboardContext((c) => c.dashboard);

    const form = useForm({
        initialValues: {
            savedChartsUuids: [],
        },
    });

    const allSavedCharts = useMemo(() => {
        const reorderedCharts = savedQueries?.sort((chartA, chartB) => {
            if (
                chartA.space.uuid === chartB.space.uuid &&
                !!chartA.lastUpdatedAt &&
                !!chartB.lastUpdatedAt
            ) {
                return chartA.lastUpdatedAt > chartB.lastUpdatedAt ? -1 : 1;
            } else if (chartA.space.uuid === dashboard?.spaceUuid) {
                return -1;
            } else if (chartB.space.uuid === dashboard?.spaceUuid) {
                return 1;
            } else {
                return 0;
            }
        });

        return (reorderedCharts || []).map((chart) => {
            const { uuid, name, space, chartKind } = chart;
            const isAlreadyAdded = dashboardTiles?.find((tile) => {
                return (
                    (tile.type === DashboardTileTypes.SAVED_CHART &&
                        tile.properties.savedChartUuid === uuid) ||
                    (tile.type === DashboardTileTypes.SQL_CHART &&
                        tile.properties.savedSqlUuid === uuid)
                );
            });

            return {
                value: uuid,
                label: name,
                group: space.name,
                tooltipLabel: isAlreadyAdded
                    ? t(
                          'components_dashboard_tiles_forms_add_chart.already_added_chart',
                      )
                    : undefined,
                chartKind,
            };
        });
    }, [savedQueries, dashboard?.spaceUuid, dashboardTiles, t]);

    const handleSubmit = form.onSubmit(({ savedChartsUuids }) => {
        onAddTiles(
            savedChartsUuids.map((uuid) => {
                const chart = savedQueries?.find((c) => c.uuid === uuid);
                const sourceType = chart?.source;

                switch (sourceType) {
                    case ChartSourceType.SQL:
                        return {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SQL_CHART,
                            properties: {
                                savedSqlUuid: uuid,
                                chartName: chart?.name ?? '',
                            },
                            tabUuid: undefined,
                            ...defaultTileSize,
                        };

                    case undefined:
                    case ChartSourceType.DBT_EXPLORE:
                        return {
                            uuid: uuid4(),
                            type: DashboardTileTypes.SAVED_CHART,
                            properties: {
                                savedChartUuid: uuid,
                                chartName: chart?.name ?? '',
                            },
                            tabUuid: undefined,
                            ...defaultTileSize,
                        };

                    default:
                        return assertUnreachable(
                            sourceType,
                            `Unknown chart source type: ${sourceType}`,
                        );
                }
            }),
        );
        onClose();
    });

    if (!savedQueries || !dashboardTiles || isInitialLoading) return null;

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
                        color="blue.6"
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
                                zIndex: getDefaultZIndex('modal'),
                            },
                            separatorLabel: {
                                color: theme.colors.gray[6],
                                fontWeight: 500,
                                backgroundColor: 'white',
                            },
                            item: {
                                paddingTop: 4,
                                paddingBottom: 4,
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
                        nothingFound={t(
                            'components_dashboard_tiles_forms_add_chart.form.saved_charts.no_charts_found',
                        )}
                        clearable
                        clearSearchOnChange
                        clearSearchOnBlur
                        searchValue={searchQuery}
                        onSearchChange={setSearchQuery}
                        maxDropdownHeight={300}
                        rightSection={
                            isFetching && <Loader size="xs" color="gray" />
                        }
                        dropdownComponent={({
                            children,
                            ...rest
                        }: ScrollAreaProps) => (
                            <ScrollArea {...rest} viewportRef={selectScrollRef}>
                                <>
                                    {children}
                                    {hasNextPage && (
                                        <Button
                                            size="xs"
                                            variant="white"
                                            onClick={async () => {
                                                await fetchNextPage();
                                            }}
                                            disabled={isFetching}
                                        >
                                            <Text>
                                                {t(
                                                    'components_dashboard_tiles_forms_add_chart.form.load_more',
                                                )}
                                            </Text>
                                        </Button>
                                    )}
                                </>
                            </ScrollArea>
                        )}
                        filter={(searchString, selected, item) => {
                            return Boolean(
                                selected ||
                                    item.label
                                        ?.toLowerCase()
                                        .includes(searchString.toLowerCase()),
                            );
                        }}
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
                        <Button
                            type="submit"
                            disabled={
                                isInitialLoading ||
                                form.values.savedChartsUuids.length === 0
                            }
                        >
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
