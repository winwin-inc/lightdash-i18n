import {
    buildPopAdditionalMetric,
    getGranularityRank,
    getItemId,
    getPopPeriodLabel,
    hasPeriodOverPeriodAdditionalMetricWithConfig,
    isDimension,
    isSupportedPeriodOverPeriodGranularity,
    timeFrameConfigs,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TimeFrames,
} from '@lightdash/common';
import {
    Alert,
    Button,
    Flex,
    Group,
    NumberInput,
    Select,
    Text,
} from '@mantine/core';
import { IconTimelineEvent } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import {
    explorerActions,
    selectAdditionalMetrics,
    selectDimensions,
    selectPeriodOverPeriodComparisonModal,
    useExplorerDispatch,
    useExplorerSelector,
} from '../../../features/explorer/store';
import MantineModal from '../../common/MantineModal';

const PeriodOverPeriodComparisonModalContent: FC<{
    metric: Metric;
    itemsMap: ItemsMap;
}> = ({ metric, itemsMap }) => {
    const { t } = useTranslation();
    const dispatch = useExplorerDispatch();
    const additionalMetrics = useExplorerSelector(selectAdditionalMetrics);
    const selectedDimensions = useExplorerSelector(selectDimensions);

    const allTimeDimensions = useMemo(() => {
        if (!itemsMap || !selectedDimensions) return [];

        return selectedDimensions
            .map((dimId) => itemsMap[dimId])
            .filter(
                (item): item is Dimension =>
                    isDimension(item) &&
                    !!item.timeInterval &&
                    isSupportedPeriodOverPeriodGranularity(item.timeInterval),
            );
    }, [itemsMap, selectedDimensions]);

    const finestRank = useMemo(() => {
        if (allTimeDimensions.length === 0) return Infinity;
        return Math.min(
            ...allTimeDimensions.map((dim) =>
                getGranularityRank(dim.timeInterval as TimeFrames),
            ),
        );
    }, [allTimeDimensions]);

    const selectData = useMemo(
        () =>
            allTimeDimensions.map((dim) => {
                const rank = getGranularityRank(dim.timeInterval as TimeFrames);
                const isCoarser = rank > finestRank;

                return {
                    value: getItemId(dim),
                    label: dim.label || dim.name,
                    disabled: isCoarser,
                };
            }),
        [allTimeDimensions, finestRank],
    );

    const [selectedTimeDimensionId, setSelectedTimeDimensionId] = useState<
        string | null
    >(null);
    const [periodOffset, setPeriodOffset] = useState<number>(1);

    const selectedDimensionObj = useMemo(() => {
        if (!selectedTimeDimensionId || !itemsMap) return null;
        const dim = itemsMap[selectedTimeDimensionId];
        return isDimension(dim) ? dim : null;
    }, [selectedTimeDimensionId, itemsMap]);

    const selectedGranularityLabel = useMemo(() => {
        if (!selectedDimensionObj?.timeInterval) return null;
        return (
            timeFrameConfigs[selectedDimensionObj.timeInterval]?.getLabel() ||
            null
        );
    }, [selectedDimensionObj]);

    const canConfigure = allTimeDimensions.length > 0;

    const selectedGranularity = useMemo(() => {
        const interval = selectedDimensionObj?.timeInterval;
        if (!interval) return null;
        if (!isSupportedPeriodOverPeriodGranularity(interval)) return null;
        return interval as TimeFrames;
    }, [selectedDimensionObj?.timeInterval]);

    const effectivePeriodOffset = useMemo(
        () => (periodOffset >= 1 ? periodOffset : 1),
        [periodOffset],
    );

    const timeDimensionId = useMemo(() => {
        if (!selectedDimensionObj) return null;
        return getItemId(selectedDimensionObj);
    }, [selectedDimensionObj]);

    const popAlreadyExists = useMemo(() => {
        if (!timeDimensionId || !selectedGranularity) return false;
        const baseMetricId = getItemId(metric);
        return hasPeriodOverPeriodAdditionalMetricWithConfig({
            additionalMetrics,
            baseMetricId,
            timeDimensionId,
            granularity: selectedGranularity,
            periodOffset: effectivePeriodOffset,
        });
    }, [
        additionalMetrics,
        effectivePeriodOffset,
        metric,
        selectedGranularity,
        timeDimensionId,
    ]);

    const confirmDisabled =
        !selectedDimensionObj ||
        !timeDimensionId ||
        !selectedGranularity ||
        popAlreadyExists;

    const closeModal = useCallback(() => {
        dispatch(
            explorerActions.togglePeriodOverPeriodComparisonModal(undefined),
        );
    }, [dispatch]);

    const handleAddComparison = useCallback(() => {
        if (!selectedDimensionObj || !timeDimensionId || !selectedGranularity)
            return;
        if (popAlreadyExists) return;

        const { additionalMetric } = buildPopAdditionalMetric({
            metric,
            timeDimensionId,
            granularity: selectedGranularity,
            periodOffset: effectivePeriodOffset,
        });
        // Auto-fetch (when enabled) picks up metrics/additionalMetrics changes
        // via useExplorerQueryEffects — same path as CustomMetricModal.
        dispatch(explorerActions.addAdditionalMetric(additionalMetric));
        dispatch(
            explorerActions.togglePeriodOverPeriodComparisonModal(undefined),
        );
    }, [
        dispatch,
        effectivePeriodOffset,
        popAlreadyExists,
        selectedDimensionObj,
        selectedGranularity,
        timeDimensionId,
        metric,
    ]);

    return (
        <MantineModal
            opened
            onClose={closeModal}
            title={t(
                'components_explorer_period_over_period_comparison_modal.title',
            )}
            icon={IconTimelineEvent}
            actions={
                <Flex gap="sm">
                    <Button variant="default" onClick={closeModal}>
                        {t(
                            'components_explorer_period_over_period_comparison_modal.cancel',
                        )}
                    </Button>
                    <Button
                        onClick={handleAddComparison}
                        disabled={confirmDisabled}
                    >
                        {t(
                            'components_explorer_period_over_period_comparison_modal.confirm',
                        )}
                    </Button>
                </Flex>
            }
        >
            {selectedGranularity && timeDimensionId && popAlreadyExists ? (
                <Alert
                    color="yellow"
                    title={t(
                        'components_explorer_period_over_period_comparison_modal.already_exists_title',
                    )}
                >
                    {t(
                        'components_explorer_period_over_period_comparison_modal.already_exists_body',
                    )}
                </Alert>
            ) : null}
            <Select
                label={t(
                    'components_explorer_period_over_period_comparison_modal.time_dimension',
                )}
                placeholder={
                    canConfigure
                        ? t(
                              'components_explorer_period_over_period_comparison_modal.time_dimension_placeholder',
                          )
                        : t(
                              'components_explorer_period_over_period_comparison_modal.time_dimension_placeholder_disabled',
                          )
                }
                data={selectData}
                value={selectedTimeDimensionId}
                onChange={setSelectedTimeDimensionId}
                disabled={!canConfigure}
                searchable
                clearable
                withinPortal
            />

            <Group spacing="xs" align="center">
                <NumberInput
                    label={t(
                        'components_explorer_period_over_period_comparison_modal.offset',
                    )}
                    min={1}
                    value={periodOffset}
                    onChange={(value) =>
                        setPeriodOffset(typeof value === 'number' ? value : 1)
                    }
                    w={120}
                />
                <Text size="sm" color="dimmed" mt="lg">
                    {selectedGranularityLabel
                        ? t(
                              'components_explorer_period_over_period_comparison_modal.granularity_label',
                              { label: selectedGranularityLabel },
                          )
                        : t(
                              'components_explorer_period_over_period_comparison_modal.granularity_from_dimension',
                          )}
                </Text>
            </Group>

            {selectedGranularity && timeDimensionId ? (
                <Text size="sm" color="dimmed">
                    {t(
                        'components_explorer_period_over_period_comparison_modal.will_create',
                    )}{' '}
                    <Text span fw={600}>
                        {metric.label}{' '}
                        {`(${getPopPeriodLabel(
                            selectedGranularity,
                            effectivePeriodOffset,
                        )})`}
                    </Text>
                </Text>
            ) : null}
        </MantineModal>
    );
};

export const PeriodOverPeriodComparisonModal: FC = () => {
    const { isOpen, metric, itemsMap } = useExplorerSelector(
        selectPeriodOverPeriodComparisonModal,
    );

    if (!isOpen || !metric || !itemsMap) return null;

    return (
        <PeriodOverPeriodComparisonModalContent
            metric={metric}
            itemsMap={itemsMap}
        />
    );
};
