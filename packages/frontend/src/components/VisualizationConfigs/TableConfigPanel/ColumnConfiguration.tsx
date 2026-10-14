import { ActionIcon, Box, Group, TextInput, Tooltip } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import {
    isTableVisualizationConfig,
    type VisualizationConfigTable,
} from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';

type ColumnConfigurationInputProps = Pick<
    ColumnConfigurationProps,
    'fieldId'
> & {
    chartConfig: VisualizationConfigTable['chartConfig'];
    disableHidingDimensions: boolean;
};

const ColumnConfigurationInput: FC<ColumnConfigurationInputProps> = ({
    fieldId,
    disableHidingDimensions,
    chartConfig: {
        updateColumnProperty,
        isColumnVisible,
        getFieldLabelOverride,
        getFieldLabelDefault,
    },
}) => {
    const fieldLabelOverride = getFieldLabelOverride(fieldId);
    const fieldLabelDefault = getFieldLabelDefault(fieldId);

    const [value, setValue] = useState(
        fieldLabelOverride ?? fieldLabelDefault ?? '',
    );
    const [debouncedValue] = useDebouncedValue(value, 500);

    useEffect(() => {
        setValue(fieldLabelOverride ?? fieldLabelDefault ?? '');
    }, [fieldId, fieldLabelOverride, fieldLabelDefault]);

    useEffect(() => {
        const currentValue = fieldLabelOverride ?? fieldLabelDefault ?? '';

        if (value !== debouncedValue) {
            return;
        }

        if (debouncedValue === currentValue) {
            return;
        }

        updateColumnProperty(fieldId, {
            name:
                debouncedValue === fieldLabelDefault
                    ? undefined
                    : debouncedValue,
        });
    }, [
        debouncedValue,
        fieldId,
        fieldLabelDefault,
        fieldLabelOverride,
        updateColumnProperty,
        value,
    ]);

    return (
        <TextInput
            disabled={!isColumnVisible(fieldId) && !disableHidingDimensions}
            placeholder={fieldLabelDefault}
            value={value}
            onChange={(e) => {
                setValue(e.currentTarget.value);
            }}
        />
    );
};

type ColumnConfigurationProps = {
    fieldId: string;
};

const ColumnConfiguration: FC<ColumnConfigurationProps> = ({ fieldId }) => {
    const { t } = useTranslation();

    const { pivotDimensions, visualizationConfig } = useVisualizationContext();

    const [isShowTooltipVisible, setShowTooltipVisible] = useState(false);
    const [isFreezeTooltipVisible, setFreezeTooltipVisible] = useState(false);

    if (!isTableVisualizationConfig(visualizationConfig)) return null;

    const { updateColumnProperty, isColumnVisible, isColumnFrozen } =
        visualizationConfig.chartConfig;

    const isPivotingDimension = !!pivotDimensions?.includes(fieldId);
    // Only the dimensions placed in Columns (pivoted) cannot be hidden.
    // Row/index dimensions (e.g. sort helpers) can be hidden from display.
    const disableHidingDimensions = isPivotingDimension;

    return (
        <Group spacing="xs" noWrap style={{ flexGrow: 1 }}>
            <Box
                style={{
                    flexGrow: 1,
                }}
            >
                <ColumnConfigurationInput
                    fieldId={fieldId}
                    chartConfig={visualizationConfig.chartConfig}
                    disableHidingDimensions={disableHidingDimensions}
                />
            </Box>

            <Tooltip
                position="top"
                opened={isShowTooltipVisible}
                withinPortal
                label={
                    isPivotingDimension
                        ? t(
                              'components_visualization_configs_table.column_configuration.tooltip_columns.part_1',
                          )
                        : disableHidingDimensions
                          ? t(
                                'components_visualization_configs_table.column_configuration.tooltip_columns.part_2',
                            )
                          : isColumnVisible(fieldId)
                            ? t(
                                  'components_visualization_configs_table.column_configuration.tooltip_columns.part_3',
                              )
                            : t(
                                  'components_visualization_configs_table.column_configuration.tooltip_columns.part_4',
                              )
                }
            >
                <Box
                    onMouseEnter={() => setShowTooltipVisible(true)}
                    onMouseLeave={() => setShowTooltipVisible(false)}
                >
                    <ActionIcon
                        disabled={disableHidingDimensions}
                        variant="light"
                        onClick={() => {
                            // TODO: render perf issues on this page seem to be
                            // causing the tooltips to stay open. This click causes a
                            // lot of re-rendering and it's easy to move the mouse away
                            // before getting mouse events back, so the tooltip
                            // stays open. We could try to solve that wholistically,
                            // but for now work around it by managing the tooltip
                            // and closing it when the button is clicked.
                            setShowTooltipVisible(false);
                            if (!disableHidingDimensions) {
                                updateColumnProperty(fieldId, {
                                    visible: !isColumnVisible(fieldId),
                                });
                            }
                        }}
                    >
                        <MantineIcon
                            icon={
                                isColumnVisible(fieldId) ? IconEyeOff : IconEye
                            }
                        />
                    </ActionIcon>
                </Box>
            </Tooltip>

            {!pivotDimensions ? (
                <Tooltip
                    position="top"
                    withinPortal
                    opened={isFreezeTooltipVisible}
                    label={
                        isColumnFrozen(fieldId)
                            ? t(
                                  'components_visualization_configs_table.column_configuration.unfreeze',
                              )
                            : t(
                                  'components_visualization_configs_table.column_configuration.freeze',
                              )
                    }
                >
                    <Box
                        onMouseEnter={() => setFreezeTooltipVisible(true)}
                        onMouseLeave={() => setFreezeTooltipVisible(false)}
                    >
                        <ActionIcon
                            variant="light"
                            onClick={() => {
                                // Close the tooltip. See comment above.
                                setFreezeTooltipVisible(false);
                                updateColumnProperty(fieldId, {
                                    frozen: !isColumnFrozen(fieldId),
                                });
                            }}
                        >
                            <MantineIcon
                                icon={
                                    isColumnFrozen(fieldId)
                                        ? IconLock
                                        : IconLockOpen
                                }
                            />
                        </ActionIcon>
                    </Box>
                </Tooltip>
            ) : null}
        </Group>
    );
};

export default ColumnConfiguration;
