import {
    countTotalFilterRules,
    getTotalFilterRules,
    type Filters,
} from '@lightdash/common';
import { Badge, Box, Divider, Group, Stack, Text } from '@mantine-8/core';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import CollapsableCard from '../../../components/common/CollapsableCard/CollapsableCard';
import FiltersForm from '../../../components/common/Filters';
import FiltersProvider from '../../../components/common/Filters/FiltersProvider';
import { useFieldsWithSuggestions } from '../../../components/Explorer/FiltersCard/useFieldsWithSuggestions';
import { useExplore } from '../../../hooks/useExplore';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { ExplorerSection } from '../../../providers/Explorer/types';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectCustomDimensions,
    selectFilters,
    selectIsEditMode,
    selectIsFiltersExpanded,
    selectTableCalculations,
    selectTableName,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../explorer/store';
import { PRIMARY_SOURCE_ID } from '../constants';
import { useMerge } from '../context/useMerge';
import { syncMergeJoinFilters } from '../utils/syncMergeJoinFilters';

const FilterSectionTitle: FC<{
    label: string;
    primary: boolean;
    count: number;
    noFiltersLabel: string;
    activeFiltersLabel: (count: number) => string;
}> = ({ label, primary, count, noFiltersLabel, activeFiltersLabel }) => (
    <Group justify="space-between" gap="xs" px="xs" pt={4} pb={2}>
        <Group gap={7}>
            <Box
                w={7}
                h={7}
                style={{
                    borderRadius: 2,
                    background: primary
                        ? 'var(--mantine-color-blue-6)'
                        : 'var(--mantine-color-orange-6)',
                }}
            />
            <Text size="xs" fw={600}>
                {label}
            </Text>
        </Group>
        <Text size="xs" c="dimmed">
            {count === 0 ? noFiltersLabel : activeFiltersLabel(count)}
        </Text>
    </Group>
);

/** Both source filters in one card. Join-key rules are shared automatically. */
export const MergeFiltersCard: FC = () => {
    const { t } = useTranslation();
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const merge = useMerge();
    const additionalSource = merge.additionalSources[0];
    const dispatch = useExplorerDispatch();

    const tableName = useExplorerSelector(selectTableName);
    const primaryFilters = useExplorerSelector(selectFilters);
    const filterIsOpen = useExplorerSelector(selectIsFiltersExpanded);
    const isEditMode = useExplorerSelector(selectIsEditMode);
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const customDimensions = useExplorerSelector(selectCustomDimensions);
    const tableCalculations = useExplorerSelector(selectTableCalculations);

    const { data: primaryExplore } = useExplore(tableName);
    const { data: additionalExplore } = useExplore(
        additionalSource?.exploreName ?? undefined,
    );
    const [hasEverOpened, setHasEverOpened] = useState(false);
    useEffect(() => {
        if (filterIsOpen) setHasEverOpened(true);
    }, [filterIsOpen]);

    const primaryFields = useFieldsWithSuggestions({
        exploreData: primaryExplore,
        rows: undefined,
        customDimensions,
        additionalMetrics,
        tableCalculations,
    });
    const additionalFields = useFieldsWithSuggestions({
        exploreData: additionalExplore,
        rows: undefined,
        customDimensions: additionalSource?.customDimensions,
        additionalMetrics: additionalSource?.additionalMetrics,
        tableCalculations: undefined,
    });

    const primaryCount = useMemo(
        () => countTotalFilterRules(primaryFilters),
        [primaryFilters],
    );
    const additionalCount = useMemo(
        () => countTotalFilterRules(additionalSource?.filters ?? {}),
        [additionalSource?.filters],
    );
    const total = useMemo(
        () =>
            new Set(
                [
                    ...getTotalFilterRules(primaryFilters),
                    ...getTotalFilterRules(additionalSource?.filters ?? {}),
                ].map((rule) => rule.id),
            ).size,
        [primaryFilters, additionalSource?.filters],
    );

    const setBoth = useCallback(
        (
            changedSourceId: string,
            nextPrimary: Filters,
            nextAdditional: Filters,
        ) => {
            if (!additionalSource) return;
            const synced = syncMergeJoinFilters({
                changedSourceId,
                filtersBySourceId: {
                    [PRIMARY_SOURCE_ID]: nextPrimary,
                    [additionalSource.id]: nextAdditional,
                },
                joinParts: merge.joinParts,
            });
            dispatch(
                explorerActions.setFilters(
                    synced[PRIMARY_SOURCE_ID] ?? nextPrimary,
                ),
            );
            merge.setSourceFilters(
                additionalSource.id,
                synced[additionalSource.id] ?? nextAdditional,
            );
        },
        [additionalSource, dispatch, merge],
    );

    return (
        <CollapsableCard
            isOpen={filterIsOpen}
            title={t('features_mergeQuery.filters')}
            disabled={total === 0 && !isEditMode}
            onToggle={() =>
                dispatch(
                    explorerActions.toggleExpandedSection(
                        ExplorerSection.FILTERS,
                    ),
                )
            }
            headerElement={
                total > 0 && !filterIsOpen ? (
                    <Badge color="gray" variant="light" tt="none" fw={500}>
                        {t('features_mergeQuery.active_filters_badge', {
                            count: total,
                        })}
                    </Badge>
                ) : null
            }
        >
            {hasEverOpened && (
                <Stack gap="md">
                    <Stack gap="xs">
                        <FilterSectionTitle
                            label={
                                primaryExplore?.label ??
                                t('features_mergeQuery.first_table')
                            }
                            primary
                            count={primaryCount}
                            noFiltersLabel={t('features_mergeQuery.no_filters')}
                            activeFiltersLabel={(count) =>
                                t('features_mergeQuery.active_filters', {
                                    count,
                                })
                            }
                        />
                        <FiltersProvider
                            projectUuid={projectUuid}
                            itemsMap={primaryFields}
                            startOfWeek={
                                project.data?.warehouseConnection
                                    ?.startOfWeek ?? undefined
                            }
                            popoverProps={{ withinPortal: true }}
                            baseTable={primaryExplore?.baseTable}
                        >
                            <FiltersForm
                                isEditMode={isEditMode}
                                filters={primaryFilters}
                                setFilters={(next) =>
                                    setBoth(
                                        PRIMARY_SOURCE_ID,
                                        next,
                                        additionalSource?.filters ?? {},
                                    )
                                }
                            />
                        </FiltersProvider>
                    </Stack>

                    <Divider />

                    <Stack gap="xs">
                        <FilterSectionTitle
                            label={
                                additionalExplore?.label ??
                                t('features_mergeQuery.second_table')
                            }
                            primary={false}
                            count={additionalCount}
                            noFiltersLabel={t('features_mergeQuery.no_filters')}
                            activeFiltersLabel={(count) =>
                                t('features_mergeQuery.active_filters', {
                                    count,
                                })
                            }
                        />
                        <FiltersProvider
                            projectUuid={projectUuid}
                            itemsMap={additionalFields}
                            startOfWeek={
                                project.data?.warehouseConnection
                                    ?.startOfWeek ?? undefined
                            }
                            popoverProps={{ withinPortal: true }}
                            baseTable={additionalExplore?.baseTable}
                        >
                            <FiltersForm
                                isEditMode={isEditMode}
                                filters={additionalSource?.filters ?? {}}
                                setFilters={(next) =>
                                    additionalSource &&
                                    setBoth(
                                        additionalSource.id,
                                        primaryFilters,
                                        next,
                                    )
                                }
                            />
                        </FiltersProvider>
                    </Stack>

                    <Text size="xs" c="dimmed" px="xs" pb="xs">
                        {t('features_mergeQuery.filters_join_hint')}
                    </Text>
                </Stack>
            )}
        </CollapsableCard>
    );
};
