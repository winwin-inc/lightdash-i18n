import {
    ActionIcon,
    Box,
    Group,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconEye,
    IconEyeOff,
    IconLock,
    IconLockOpen,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
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

    // 列名提交规则只保留一份：debounce 与失焦都走这里，避免两处规则漂移
    const commitName = useCallback(
        (nextValue: string) => {
            const currentValue = fieldLabelOverride ?? fieldLabelDefault ?? '';
            if (nextValue === currentValue) return;

            updateColumnProperty(fieldId, {
                name: nextValue === fieldLabelDefault ? undefined : nextValue,
            });
        },
        [fieldId, fieldLabelDefault, fieldLabelOverride, updateColumnProperty],
    );

    useEffect(() => {
        setValue(fieldLabelOverride ?? fieldLabelDefault ?? '');
    }, [fieldId, fieldLabelOverride, fieldLabelDefault]);

    useEffect(() => {
        // 等用户停止输入再提交，避免每个字符都写一次配置
        if (value !== debouncedValue) {
            return;
        }

        commitName(debouncedValue);
    }, [commitName, debouncedValue, value]);

    return (
        <TextInput
            disabled={!isColumnVisible(fieldId) && !disableHidingDimensions}
            placeholder={fieldLabelDefault}
            value={value}
            onChange={(e) => {
                setValue(e.currentTarget.value);
            }}
            onBlur={() => {
                // 输入后立刻点保存/失焦时，不等 500ms debounce，立即提交
                commitName(value);
            }}
        />
    );
};

type ColumnConfigurationProps = {
    fieldId: string;
};

const ColumnConfiguration: FC<ColumnConfigurationProps> = ({ fieldId }) => {
    const { t, i18n } = useTranslation();

    const { pivotDimensions, visualizationConfig } = useVisualizationContext();

    const [isShowTooltipVisible, setShowTooltipVisible] = useState(false);
    const [isFreezeTooltipVisible, setFreezeTooltipVisible] = useState(false);

    if (!isTableVisualizationConfig(visualizationConfig)) return null;

    const {
        updateColumnProperty,
        isColumnVisible,
        isColumnFrozen,
        isLastVisibleRowDimension,
        columnProperties,
        setLocalColumnWidth,
    } = visualizationConfig.chartConfig;
    const columnWidth = columnProperties[fieldId]?.width;

    const isPivotingDimension = !!pivotDimensions?.includes(fieldId);
    // Only the dimensions placed in Columns (pivoted) cannot be hidden.
    // Row/index dimensions (e.g. sort helpers) can be hidden from display,
    // but a pivot table needs at least one visible row dimension to render,
    // so the last one is protected too.
    const isLastVisibleRowDim =
        !isPivotingDimension && (isLastVisibleRowDimension?.(fieldId) ?? false);
    const disableHidingDimensions = isPivotingDimension || isLastVisibleRowDim;

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
                        : isLastVisibleRowDim
                        ? // locale 文案在 public/locales/{en,zh}/translation.json 就绪前，
                          // 先用 defaultValue 兜底，避免用户看到原始 key
                          t(
                              'components_visualization_configs_table.column_configuration.tooltip_columns.last_visible_row_dimension',
                              {
                                  defaultValue: i18n.language?.startsWith('zh')
                                      ? '至少要保留一个行维度可见，否则透视表无法渲染'
                                      : 'Keep at least one row dimension visible, otherwise the pivot table cannot render',
                              },
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

            {columnWidth !== undefined ? (
                <Tooltip
                    position="top"
                    withinPortal
                    label={t(
                        'components_visualization_configs_table.column_configuration.reset_width',
                    )}
                >
                    <Group
                        spacing={2}
                        noWrap
                        px={4}
                        py={2}
                        bg="ldGray.1"
                        style={{ borderRadius: 4, cursor: 'pointer' }}
                        data-testid="column-width-reset"
                        onClick={() => {
                            // 本地覆盖层优先级更高，一并清掉，否则「点了没变化」
                            setLocalColumnWidth(fieldId, null);
                            updateColumnProperty(fieldId, {
                                width: undefined,
                            });
                        }}
                    >
                        <Text size="xs" c="dimmed">
                            {Math.round(columnWidth)}px
                        </Text>
                        <ActionIcon size="xs" variant="transparent">
                            <MantineIcon icon={IconX} size={12} />
                        </ActionIcon>
                    </Group>
                </Tooltip>
            ) : null}
        </Group>
    );
};

export default ColumnConfiguration;
