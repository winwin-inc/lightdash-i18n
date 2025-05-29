import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { Box, Checkbox, Stack, Switch, Tooltip } from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../../hooks/toaster/useToaster';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';
import ColumnConfiguration from './ColumnConfiguration';
import DroppableItemsList from './DroppableItemsList';
import { MAX_PIVOTS } from './constants';

enum DroppableIds {
    COLUMNS = 'COLUMNS',
    ROWS = 'ROWS',
}

const GeneralSettings: FC = () => {
    const { t } = useTranslation();

    const {
        resultsData,
        pivotDimensions,
        visualizationConfig,
        setPivotDimensions,
    } = useVisualizationContext();
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const { showToastError } = useToaster();
    const { dimensions } = resultsData?.metricQuery || {
        dimensions: [] as string[],
    };

    const isTableConfig = isTableVisualizationConfig(visualizationConfig);

    const chartConfig = useMemo(() => {
        return isTableConfig ? visualizationConfig.chartConfig : undefined;
    }, [visualizationConfig, isTableConfig]);

    const {
        columns,
        rows,
        metrics,
    }: { columns: string[]; rows: string[]; metrics: string[] } =
        useMemo(() => {
            const columnFields = pivotDimensions ?? [];
            const rowsFields = [...dimensions].filter(
                (itemId) => !pivotDimensions?.includes(itemId),
            );
            const metricsFields = (chartConfig?.selectedItemIds ?? []).filter(
                (id) => ![...columnFields, ...rowsFields].includes(id),
            );
            return {
                columns: columnFields,
                rows: rowsFields,
                metrics: metricsFields,
            };
        }, [pivotDimensions, dimensions, chartConfig]);

    const handleToggleMetricsAsRows = useCallback(() => {
        if (!chartConfig) return;

        const {
            metricsAsRows,
            showRowCalculation,
            showColumnCalculation,
            setShowColumnCalculation,
            setShowRowCalculation,
            setMetricsAsRows,
        } = chartConfig;

        const newValue = !metricsAsRows;

        if (newValue) {
            setShowColumnCalculation(showColumnCalculation);
            setShowRowCalculation(showRowCalculation);
        } else {
            setShowColumnCalculation(showColumnCalculation);
            setShowRowCalculation(showRowCalculation);
        }

        setMetricsAsRows(newValue);
    }, [chartConfig]);

    const onDragEnd = useCallback(
        ({ source, destination }: DropResult) => {
            if (!chartConfig) return;

            setIsDragging(false);
            if (!destination) return;

            if (source.droppableId !== destination.droppableId) {
                if (destination.droppableId === DroppableIds.COLUMNS) {
                    if (columns.length >= MAX_PIVOTS) {
                        showToastError({
                            title: t(
                                'components_visualization_configs_table.settings.maximum_error',
                            ),
                        });
                        return;
                    }
                    // Add pivot
                    const fieldId = rows[source.index];
                    setPivotDimensions([
                        ...columns.slice(0, destination.index),
                        fieldId,
                        ...columns.slice(destination.index),
                    ]);
                } else {
                    // Remove pivot
                    const fieldId = columns[source.index];
                    const newPivotDimensions = columns.filter(
                        (key) => key !== fieldId,
                    );

                    if (
                        chartConfig.metricsAsRows &&
                        (!newPivotDimensions || newPivotDimensions.length === 0)
                    ) {
                        handleToggleMetricsAsRows();
                    }
                    setPivotDimensions(newPivotDimensions);
                }
            } else if (destination.droppableId === DroppableIds.COLUMNS) {
                // Reorder pivot
                const fieldId = columns[source.index];
                const columnsWithoutReorderField = columns.filter(
                    (key) => key !== fieldId,
                );
                setPivotDimensions([
                    ...columnsWithoutReorderField.slice(0, destination.index),
                    fieldId,
                    ...columnsWithoutReorderField.slice(destination.index),
                ]);
            }
        },
        [
            columns,
            rows,
            chartConfig,
            setPivotDimensions,
            showToastError,
            handleToggleMetricsAsRows,
            t,
        ],
    );

    if (!chartConfig) return null;

    const {
        isPivotTableEnabled,
        canUseSubtotals,
        hideRowNumbers,
        metricsAsRows,
        setHideRowNumbers,
        setShowColumnCalculation,
        setShowResultsTotal,
        setShowRowCalculation,
        setShowSubtotals,
        setShowTableNames,
        showColumnCalculation,
        showResultsTotal,
        showRowCalculation,
        showSubtotals,
        showTableNames,
    } = chartConfig;

    return (
        <Stack>
            <DragDropContext
                onDragStart={() => setIsDragging(true)}
                onDragEnd={onDragEnd}
            >
                <Config>
                    <Config.Section>
                        <Config.Heading>
                            {t(
                                'components_visualization_configs_table.settings.columns',
                            )}
                        </Config.Heading>
                        <DroppableItemsList
                            droppableId={DroppableIds.COLUMNS}
                            itemIds={columns}
                            isDragging={isDragging}
                            disableReorder={false}
                            placeholder={t(
                                'components_visualization_configs_table.settings.drag_dimensions',
                            )}
                        />

                        <Config.Heading>
                            {t(
                                'components_visualization_configs_table.settings.rows',
                            )}
                        </Config.Heading>
                        <DroppableItemsList
                            droppableId={DroppableIds.ROWS}
                            itemIds={rows}
                            isDragging={isDragging}
                            disableReorder={true}
                            placeholder={t(
                                'components_visualization_configs_table.settings.drag_dimensions_to_area',
                            )}
                        />
                    </Config.Section>
                </Config>
            </DragDropContext>

            <Config.Section>
                <Config.Section>
                    <Config.Heading>
                        {t(
                            'components_visualization_configs_table.settings.metrics',
                        )}
                    </Config.Heading>
                    <Tooltip
                        disabled={!!isPivotTableEnabled && !showSubtotals}
                        label={
                            showSubtotals
                                ? t(
                                      'components_visualization_configs_table.settings.metrics_not_available',
                                  )
                                : t(
                                      'components_visualization_configs_table.settings.use_metrics',
                                  )
                        }
                        w={300}
                        multiline
                        withinPortal
                        position="top-start"
                    >
                        <Box>
                            <Switch
                                disabled={!isPivotTableEnabled || showSubtotals}
                                label={t(
                                    'components_visualization_configs_table.settings.show_metrics',
                                )}
                                labelPosition="right"
                                checked={metricsAsRows}
                                onChange={() => handleToggleMetricsAsRows()}
                            />
                        </Box>
                    </Tooltip>
                </Config.Section>
            </Config.Section>

            <Config.Section>
                {metrics.map((itemId) => (
                    <ColumnConfiguration key={itemId} fieldId={itemId} />
                ))}
            </Config.Section>

            <Config.Section>
                <Config.Heading>
                    {t(
                        'components_visualization_configs_table.settings.display',
                    )}
                </Config.Heading>

                <Checkbox
                    label={t(
                        'components_visualization_configs_table.settings.show_table_names',
                    )}
                    checked={showTableNames}
                    onChange={() => {
                        setShowTableNames(!showTableNames);
                    }}
                />
                <Checkbox
                    label={t(
                        'components_visualization_configs_table.settings.show_row_numbers',
                    )}
                    checked={!hideRowNumbers}
                    onChange={() => {
                        setHideRowNumbers(!hideRowNumbers);
                    }}
                />
            </Config.Section>

            <Config.Section>
                <Config.Heading>
                    {t(
                        'components_visualization_configs_table.settings.results',
                    )}
                </Config.Heading>
                {isPivotTableEnabled ? (
                    <Checkbox
                        label={t(
                            'components_visualization_configs_table.settings.show_row_totals',
                        )}
                        checked={showRowCalculation}
                        onChange={() => {
                            setShowRowCalculation(!showRowCalculation);
                        }}
                    />
                ) : null}
                <Checkbox
                    label={t(
                        'components_visualization_configs_table.settings.show_column_totals',
                    )}
                    checked={showColumnCalculation}
                    onChange={() => {
                        setShowColumnCalculation(!showColumnCalculation);
                    }}
                />
                <Checkbox
                    label={t(
                        'components_visualization_configs_table.settings.show_number_of_results',
                    )}
                    checked={showResultsTotal}
                    onChange={() => {
                        setShowResultsTotal(!showResultsTotal);
                    }}
                />
                <Tooltip
                    disabled={canUseSubtotals}
                    label={
                        metricsAsRows
                            ? t(
                                  'components_visualization_configs_table.settings.subtotals_cant_be_used',
                              )
                            : t(
                                  'components_visualization_configs_table.settings.at_least_two_dimensions',
                                  {
                                      privoted: isPivotTableEnabled
                                          ? 'un-pivoted'
                                          : '',
                                  },
                              )
                    }
                    w={300}
                    multiline
                    withinPortal
                    position="top-start"
                >
                    <Box>
                        <Checkbox
                            label={t(
                                'components_visualization_configs_table.settings.show_subtotals',
                            )}
                            checked={
                                canUseSubtotals &&
                                !metricsAsRows &&
                                showSubtotals
                            }
                            onChange={() => {
                                setShowSubtotals(!showSubtotals);
                            }}
                            disabled={!canUseSubtotals || metricsAsRows}
                        />
                    </Box>
                </Tooltip>
            </Config.Section>
        </Stack>
    );
};

export default GeneralSettings;
