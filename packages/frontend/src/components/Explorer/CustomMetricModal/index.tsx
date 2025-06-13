import {
    canApplyFormattingToCustomMetric,
    CustomFormatType,
    friendlyName,
    getFilterableDimensionsFromItemsMap,
    getItemId,
    getMetrics,
    isAdditionalMetric,
    isCustomDimension,
    isDimension,
    MetricType,
    NumberSeparator,
    type AdditionalMetric,
    type CustomFormat,
    type Dimension,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Accordion,
    Button,
    Modal,
    NumberInput,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ValueOf } from 'type-fest';
import { v4 as uuidv4 } from 'uuid';

import useToaster from '../../../hooks/toaster/useToaster';
import { useExplore } from '../../../hooks/useExplore';
import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import FiltersProvider from '../../common/Filters/FiltersProvider';
import { FormatForm } from '../FormatForm';
import { FilterForm, type MetricFilterRuleWithFieldId } from './FilterForm';
import { useDataForFiltersProvider } from './hooks/useDataForFiltersProvider';
import {
    addFieldIdToMetricFilterRule,
    getCustomMetricName,
    prepareCustomMetricData,
} from './utils';

export const CustomMetricModal = () => {
    const { t } = useTranslation();

    const {
        isOpen,
        isEditing,
        item,
        type: customMetricType,
    } = useExplorerContext((context) => context.state.modals.additionalMetric);

    const toggleModal = useExplorerContext(
        (context) => context.actions.toggleAdditionalMetricModal,
    );
    const additionalMetrics = useExplorerContext(
        (context) =>
            context.state.unsavedChartVersion.metricQuery.additionalMetrics,
    );

    const addAdditionalMetric = useExplorerContext(
        (context) => context.actions.addAdditionalMetric,
    );

    const editAdditionalMetric = useExplorerContext(
        (context) => context.actions.editAdditionalMetric,
    );
    const tableName = useExplorerContext(
        (context) => context.state.unsavedChartVersion.tableName,
    );

    const { data: exploreData } = useExplore(tableName);

    const { showToastSuccess } = useToaster();

    let dimensionToCheck: Dimension | undefined;

    const { projectUuid, fieldsMap, startOfWeek } = useDataForFiltersProvider();

    const dimensionsMap = useMemo(
        () => getFilterableDimensionsFromItemsMap(fieldsMap),
        [fieldsMap],
    );

    if (isDimension(item)) {
        dimensionToCheck = item;
    }
    if (isEditing && isAdditionalMetric(item) && item.baseDimensionName) {
        dimensionToCheck =
            exploreData?.tables[item.table]?.dimensions[item.baseDimensionName];
    }

    const canApplyFormatting = useMemo(
        () =>
            dimensionToCheck &&
            customMetricType &&
            canApplyFormattingToCustomMetric(
                dimensionToCheck,
                customMetricType,
            ),
        [dimensionToCheck, customMetricType],
    );

    const form = useForm<
        Pick<AdditionalMetric, 'percentile'> & {
            format: CustomFormat;
            customMetricLabel: string;
        }
    >({
        validateInputOnChange: true,
        validateInputOnBlur: true,
        initialValues: {
            customMetricLabel: '',
            percentile: 50,
            format: {
                type: CustomFormatType.DEFAULT,
                round: undefined,
                separator: NumberSeparator.DEFAULT,
                currency: undefined,
                compact: undefined,
                prefix: undefined,
                suffix: undefined,
            },
        },
        validate: {
            customMetricLabel: (label) => {
                if (!label) return null;

                if (!item) return null;

                const metricName = getCustomMetricName(
                    item.table,
                    label,
                    isEditing &&
                        isAdditionalMetric(item) &&
                        'baseDimensionName' in item &&
                        item.baseDimensionName
                        ? item.baseDimensionName
                        : item.name,
                );

                const metricIds = exploreData
                    ? getMetrics(exploreData).map(getItemId)
                    : [];
                if (
                    metricIds.includes(
                        getItemId({ table: item.table, name: metricName }),
                    )
                ) {
                    return 'Metric with this ID already exists';
                }

                if (isEditing && metricName === item.name) {
                    return null;
                }

                return additionalMetrics?.some(
                    (metric) => metric.name === metricName,
                )
                    ? t(
                          'components_explorer_custom_metric_modal.validate_metric_label.already_exists',
                      )
                    : null;
            },
            percentile: (percentile) => {
                if (!percentile) return null;
                if (percentile < 0 || percentile > 100) {
                    return t(
                        'components_explorer_custom_metric_modal.validate_metric_label.percentile',
                    );
                }
            },
        },
    });

    const { setFieldValue } = form;
    useEffect(() => {
        if (!item || !customMetricType) return;

        const label = isCustomDimension(item) ? item.name : item.label;
        if (label && customMetricType) {
            setFieldValue(
                'customMetricLabel',
                isEditing
                    ? label
                    : customMetricType
                    ? `${friendlyName(customMetricType)} of ${label}`
                    : '',
            );
        }
    }, [setFieldValue, item, customMetricType, isEditing]);

    const initialCustomMetricFiltersWithIds = useMemo(() => {
        if (!isEditing) return [];

        return isAdditionalMetric(item)
            ? item.filters?.map((filterRule) =>
                  addFieldIdToMetricFilterRule(filterRule),
              ) || []
            : [];
    }, [isEditing, item]);

    const [customMetricFiltersWithIds, setCustomMetricFiltersWithIds] =
        useState<MetricFilterRuleWithFieldId[]>(
            initialCustomMetricFiltersWithIds,
        );

    useEffect(() => {
        setCustomMetricFiltersWithIds(initialCustomMetricFiltersWithIds);
    }, [initialCustomMetricFiltersWithIds]);

    useEffect(
        function populateForm() {
            if (isEditing && isAdditionalMetric(item)) {
                if (item.percentile)
                    setFieldValue('percentile', item.percentile);

                if (item.formatOptions) {
                    setFieldValue('format', {
                        // This spread is intentional to avoid @mantine/form mutating the enum object `item.formatOptions.type`
                        ...item.formatOptions,
                    });
                }
            }
        },
        [isEditing, item, setFieldValue],
    );

    const handleClose = useCallback(() => {
        form.reset();
        toggleModal();
    }, [form, toggleModal]);

    const handleOnSubmit = form.onSubmit(
        ({ customMetricLabel, percentile, format }) => {
            if (!item || !customMetricType) return;

            const data = prepareCustomMetricData({
                item,
                type: customMetricType,
                customMetricLabel,
                customMetricFiltersWithIds,
                isEditingCustomMetric: !!isEditing,
                exploreData,
                percentile,
                formatOptions: format,
            });

            if (isEditing && isAdditionalMetric(item)) {
                editAdditionalMetric(
                    {
                        ...item,
                        ...data,
                    },
                    getItemId(item),
                );
                showToastSuccess({
                    title: t(
                        'components_explorer_custom_metric_modal.toast_submit.edit_success',
                    ),
                });
            } else if (isDimension(item) && form.values.customMetricLabel) {
                addAdditionalMetric({
                    uuid: uuidv4(),
                    baseDimensionName: item.name,
                    ...data,
                });
                showToastSuccess({
                    title: t(
                        'components_explorer_custom_metric_modal.toast_submit.add_success',
                    ),
                });
            } else if (isCustomDimension(item)) {
                addAdditionalMetric({
                    uuid: uuidv4(),
                    // Do not add baseDimensionName to avoid invalid validation errors in queryBuilder
                    ...data,
                });
                showToastSuccess({
                    title: t(
                        'components_explorer_custom_metric_modal.toast_submit.add_success',
                    ),
                });
            }
            handleClose();
        },
    );

    const defaultFilterRuleFieldId = useMemo(() => {
        if (item) {
            if (!isEditing) return getItemId(item);

            if (
                isEditing &&
                'baseDimensionName' in item &&
                item.baseDimensionName
            ) {
                return `${item.table}_${item.baseDimensionName}`;
            }
        }
    }, [isEditing, item]);

    const getFormatInputProps = (path: keyof CustomFormat) =>
        form.getInputProps(`format.${path}`);

    const setFormatFieldValue = (
        path: keyof CustomFormat,
        value: ValueOf<CustomFormat>,
    ) => form.setFieldValue(`format.${path}`, value);

    return item ? (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={isOpen}
            onClose={handleClose}
            title={
                <Title order={4}>
                    {isEditing
                        ? t(
                              'components_explorer_custom_metric_modal.title.edit',
                          )
                        : t(
                              'components_explorer_custom_metric_modal.title.create',
                          )}
                </Title>
            }
        >
            <form onSubmit={handleOnSubmit}>
                <Stack>
                    <TextInput
                        label={t(
                            'components_explorer_custom_metric_modal.label.label',
                        )}
                        required
                        placeholder={t(
                            'components_explorer_custom_metric_modal.label.placeholder',
                        )}
                        {...form.getInputProps('customMetricLabel')}
                    />
                    {customMetricType === MetricType.PERCENTILE && (
                        <NumberInput
                            w={100}
                            max={100}
                            min={0}
                            required
                            label={t(
                                'components_explorer_custom_metric_modal.percentile.label',
                            )}
                            {...form.getInputProps('percentile')}
                        />
                    )}
                    <Accordion chevronPosition="left" chevronSize="xs">
                        {canApplyFormatting && (
                            <Accordion.Item value="format">
                                <Accordion.Control>
                                    <Text fw={500} fz="sm">
                                        {t(
                                            'components_explorer_custom_metric_modal.format',
                                        )}
                                    </Text>
                                </Accordion.Control>
                                <Accordion.Panel>
                                    <FormatForm
                                        formatInputProps={getFormatInputProps}
                                        format={form.values.format}
                                        setFormatFieldValue={
                                            setFormatFieldValue
                                        }
                                    />
                                </Accordion.Panel>
                            </Accordion.Item>
                        )}
                        <Accordion.Item value="filters">
                            <Accordion.Control>
                                <Text fw={500} fz="sm">
                                    {t(
                                        'components_explorer_custom_metric_modal.filters.part_1',
                                    )}
                                    <Text span fw={400} fz="xs">
                                        {customMetricFiltersWithIds.length > 0
                                            ? `(${customMetricFiltersWithIds.length}) `
                                            : ' '}
                                    </Text>
                                    <Text span fz="xs" color="gray.5" fw={400}>
                                        (
                                        {t(
                                            'components_explorer_custom_metric_modal.filters.part_2',
                                        )}
                                        )
                                    </Text>
                                </Text>
                            </Accordion.Control>
                            <Accordion.Panel>
                                <FiltersProvider<
                                    Record<string, FilterableDimension>
                                >
                                    projectUuid={projectUuid}
                                    itemsMap={dimensionsMap}
                                    startOfWeek={startOfWeek ?? undefined}
                                    popoverProps={{
                                        withinPortal: true,
                                    }}
                                >
                                    <FilterForm
                                        defaultFilterRuleFieldId={
                                            defaultFilterRuleFieldId
                                        }
                                        customMetricFiltersWithIds={
                                            customMetricFiltersWithIds
                                        }
                                        setCustomMetricFiltersWithIds={
                                            setCustomMetricFiltersWithIds
                                        }
                                    />
                                </FiltersProvider>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>
                    <Button
                        display="block"
                        ml="auto"
                        type="submit"
                        disabled={!form.isValid()}
                    >
                        {isEditing
                            ? t(
                                  'components_explorer_custom_metric_modal.save_changes',
                              )
                            : t(
                                  'components_explorer_custom_metric_modal.create',
                              )}
                    </Button>
                </Stack>
            </form>
        </Modal>
    ) : null;
};
