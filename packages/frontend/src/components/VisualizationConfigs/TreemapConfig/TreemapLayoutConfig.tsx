import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import {
    ECHARTS_DEFAULT_COLORS,
    getItemId,
    getItemLabelWithoutTableName,
    isField,
    isTableCalculation,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import {
    Group,
    NumberInput,
    Stack,
    Switch,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconGripVertical, IconHelpCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { isTreemapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import FieldSelect from '../../common/FieldSelect';
import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';
import { DraggablePortalHandler } from './DraggablePortalHandler';

import classes from './DndList.module.css';

export const Layout: React.FC = () => {
    const { t } = useTranslation();

    const { visualizationConfig, itemsMap } = useVisualizationContext();

    if (!isTreemapVisualizationConfig(visualizationConfig)) return null;

    const numericMetrics = Object.values(visualizationConfig.numericMetrics);

    const {
        groupFieldIds,
        groupReorder,

        selectedSizeMetric,
        sizeMetricChange,

        useDynamicColors,
        toggleDynamicColors,
        selectedColorMetric,
        colorMetricChange,
        startColor,
        endColor,
        onStartColorChange,
        onEndColorChange,
        startColorThreshold,
        setStartColorThreshold,
        endColorThreshold,
        setEndColorThreshold,
    } = visualizationConfig.chartConfig;

    const orderedDimensions = !itemsMap
        ? null
        : groupFieldIds
              .filter((id) => id !== null && id !== undefined)
              .filter((id) => itemsMap[id])
              .map((dimensionId, index) => {
                  const dimension = itemsMap[dimensionId];

                  return (
                      <Draggable
                          key={dimensionId}
                          index={index}
                          draggableId={dimensionId}
                      >
                          {(provided, snapshot) => (
                              <DraggablePortalHandler snapshot={snapshot}>
                                  <div
                                      className={`${classes.item} ${
                                          snapshot.isDragging
                                              ? classes.itemDragging
                                              : ''
                                      }`}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      ref={provided.innerRef}
                                  >
                                      <div className={classes.dragHandle}>
                                          <IconGripVertical
                                              size={18}
                                              stroke={1.5}
                                          />
                                      </div>
                                      <Text>
                                          {getItemLabelWithoutTableName(
                                              dimension,
                                          )}
                                      </Text>
                                  </div>
                              </DraggablePortalHandler>
                          )}
                      </Draggable>
                  );
              });

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Group spacing="xs">
                        <Config.Heading>{t('components_visualization_configs_treemap.layout_config.dimension_hierarchy.label')}</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
                            label={t('components_visualization_configs_treemap.layout_config.dimension_hierarchy.tooltip')}
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                    </Group>
                    <DragDropContext
                        onDragEnd={({ destination, source }) => {
                            if (!destination) return;
                            groupReorder({
                                from: source.index,
                                to: destination.index,
                            });
                        }}
                    >
                        <Droppable droppableId="dnd-list" direction="vertical">
                            {(provided) => (
                                <div
                                    ref={provided.innerRef}
                                    {...provided.droppableProps}
                                >
                                    {orderedDimensions}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Group spacing="xs">
                        <Config.Heading>{t('components_visualization_configs_treemap.layout_config.size_metric.label')}</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
                            label={t('components_visualization_configs_treemap.layout_config.size_metric.tooltip')}
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                    </Group>
                    <Group>
                        <FieldSelect<Metric | TableCalculation>
                            placeholder={t('components_visualization_configs_treemap.layout_config.size_metric.select_metric')}
                            disabled={numericMetrics.length === 0}
                            item={selectedSizeMetric}
                            items={numericMetrics}
                            onChange={(newField) => {
                                if (newField && isField(newField))
                                    sizeMetricChange(getItemId(newField));
                                else if (
                                    newField &&
                                    isTableCalculation(newField)
                                )
                                    sizeMetricChange(newField.name);
                                else sizeMetricChange(null);
                            }}
                            hasGrouping
                        />
                    </Group>
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Group spacing="xs">
                        <Config.Heading>{t('components_visualization_configs_treemap.layout_config.color_metric.label')}</Config.Heading>
                        <Tooltip
                            withinPortal={true}
                            maw={350}
                            variant="xs"
                            multiline
                            label={t('components_visualization_configs_treemap.layout_config.color_metric.tooltip')}
                        >
                            <MantineIcon
                                icon={IconHelpCircle}
                                size="md"
                                display="inline"
                                color="gray"
                            />
                        </Tooltip>
                        <Switch
                            checked={useDynamicColors}
                            onChange={toggleDynamicColors}
                        />
                    </Group>
                    {useDynamicColors ? (
                        <Group spacing="xs">
                            <FieldSelect<Metric | TableCalculation>
                                placeholder={t('components_visualization_configs_treemap.layout_config.color_metric.select_metric')}
                                disabled={numericMetrics.length === 0}
                                item={selectedColorMetric}
                                items={numericMetrics}
                                onChange={(newField) => {
                                    if (newField && isField(newField))
                                        colorMetricChange(getItemId(newField));
                                    else if (
                                        newField &&
                                        isTableCalculation(newField)
                                    )
                                        colorMetricChange(newField.name);
                                    else colorMetricChange(null);
                                }}
                                hasGrouping
                            />
                            <Group spacing="xs">
                                <Config.Label>{t('components_visualization_configs_treemap.layout_config.color_metric.min_color')}</Config.Label>
                                <ColorSelector
                                    color={startColor}
                                    swatches={ECHARTS_DEFAULT_COLORS}
                                    withAlpha
                                    onColorChange={onStartColorChange}
                                />
                                <Config.Label>{t('components_visualization_configs_treemap.layout_config.color_metric.threshold')}</Config.Label>
                                <NumberInput
                                    value={startColorThreshold}
                                    onChange={setStartColorThreshold}
                                    hideControls={true}
                                    precision={2}
                                    placeholder={t('components_visualization_configs_treemap.layout_config.color_metric.auto')}
                                />
                            </Group>
                            <Group spacing="xs">
                                <Config.Label>{t('components_visualization_configs_treemap.layout_config.color_metric.max_color')}</Config.Label>
                                <ColorSelector
                                    color={endColor}
                                    swatches={ECHARTS_DEFAULT_COLORS}
                                    withAlpha
                                    onColorChange={onEndColorChange}
                                />
                                <Config.Label>{t('components_visualization_configs_treemap.layout_config.color_metric.threshold')}</Config.Label>
                                <NumberInput
                                    value={endColorThreshold}
                                    onChange={setEndColorThreshold}
                                    hideControls={true}
                                    precision={2}
                                    placeholder={t('components_visualization_configs_treemap.layout_config.color_metric.auto')}
                                />
                            </Group>
                        </Group>
                    ) : null}
                </Config.Section>
            </Config>
        </Stack>
    );
};
