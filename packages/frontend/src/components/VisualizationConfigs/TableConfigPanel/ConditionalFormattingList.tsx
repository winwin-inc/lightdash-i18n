import {
    createConditionalFormattingConfigWithSingleColor,
    getItemId,
    isFilterableItem,
    isNumericItem,
    isStringDimension,
    type ConditionalFormattingConfig,
    type FilterableItem,
} from '@lightdash/common';
import { Accordion } from '@mantine/core';
import { produce } from 'immer';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { AddButton } from '../common/AddButton';
import { Config } from '../common/Config';
import { useControlledAccordion } from '../common/hooks/useControlledAccordion';
import { ConditionalFormattingItem } from './ConditionalFormattingItem';

const ConditionalFormattingList = ({}) => {
    const { t } = useTranslation();

    const { openItems, handleAccordionChange, addNewItem, removeItem } =
        useControlledAccordion();

    const { itemsMap, resultsData, visualizationConfig, colorPalette } =
        useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isTableVisualizationConfig(visualizationConfig)) return undefined;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const activeFields = useMemo(() => {
        if (!resultsData?.metricQuery) return new Set<string>();
        return new Set([
            ...resultsData.metricQuery.dimensions,
            ...resultsData.metricQuery.metrics,
            ...resultsData.metricQuery.tableCalculations.map((tc) => tc.name),
        ]);
    }, [resultsData]);

    const fieldsForConditionalFormatting = useMemo<FilterableItem[]>(() => {
        if (!itemsMap) return [];
        return Object.values(itemsMap)
            .filter((field) => activeFields.has(getItemId(field)))
            .filter(
                (field) =>
                    (isNumericItem(field) || isStringDimension(field)) &&
                    isFilterableItem(field),
            ) as FilterableItem[];
    }, [itemsMap, activeFields]);

    const activeConfigs = useMemo(() => {
        if (!chartConfig) return [];

        const { conditionalFormattings } = chartConfig;

        return conditionalFormattings.filter((config) => {
            return config.target
                ? fieldsForConditionalFormatting.find(
                      (field) => getItemId(field) === config.target?.fieldId,
                  )
                : true;
        });
    }, [chartConfig, fieldsForConditionalFormatting]);

    const handleAdd = useCallback(() => {
        if (!chartConfig) return;

        const { onSetConditionalFormattings } = chartConfig;

        onSetConditionalFormattings(
            produce(activeConfigs, (draft) => {
                draft.push(
                    createConditionalFormattingConfigWithSingleColor(
                        colorPalette[0],
                    ),
                );
                addNewItem(`${draft.length}`);
            }),
        );
    }, [chartConfig, activeConfigs, colorPalette, addNewItem]);

    const handleRemove = useCallback(
        (index: number) => {
            if (!chartConfig) return;

            const { onSetConditionalFormattings } = chartConfig;

            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft.splice(index, 1);
                }),
            );
        },
        [chartConfig, activeConfigs],
    );

    const handleChange = useCallback(
        (index: number, newConfig: ConditionalFormattingConfig) => {
            if (!chartConfig) return;

            const { onSetConditionalFormattings } = chartConfig;

            onSetConditionalFormattings(
                produce(activeConfigs, (draft) => {
                    draft[index] = newConfig;
                }),
            );
        },
        [chartConfig, activeConfigs],
    );

    return (
        <Config>
            <Config.Section>
                <Config.Group>
                    <Config.Heading>
                        {t(
                            'components_visualization_configs_table.formatting_list.rules_and_conditions',
                        )}
                    </Config.Heading>
                    <AddButton onClick={handleAdd} />
                </Config.Group>
                <Accordion
                    multiple
                    variant="contained"
                    value={openItems}
                    onChange={handleAccordionChange}
                    styles={(theme) => ({
                        control: {
                            padding: theme.spacing.xs,
                        },
                        label: {
                            padding: 0,
                        },
                        panel: {
                            padding: 0,
                        },
                    })}
                >
                    {activeConfigs.map((conditionalFormatting, index) => (
                        <ConditionalFormattingItem
                            key={index}
                            isOpen={openItems.includes(`${index}`)}
                            addNewItem={addNewItem}
                            removeItem={removeItem}
                            colorPalette={colorPalette}
                            index={index + 1}
                            fields={fieldsForConditionalFormatting}
                            value={conditionalFormatting}
                            onChange={(newConfig) =>
                                handleChange(index, newConfig)
                            }
                            onRemove={() => handleRemove(index)}
                        />
                    ))}
                </Accordion>
            </Config.Section>
        </Config>
    );
};

export default ConditionalFormattingList;
