// TODO: Move to Series/ folder after refactor

import {
    PieChartValueLabels,
    type PieChartValueLabel,
} from '@lightdash/common';
import {
    ActionIcon,
    Checkbox,
    Group,
    SegmentedControl,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconRotateClockwise } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import { Config } from '../common/Config';

type ValueOptionsProps = {
    isValueLabelOverriden?: boolean;
    isShowValueOverriden?: boolean;
    isShowPercentageOverriden?: boolean;
    isUseCustomFormatOverriden?: boolean;
    isLabelTemplateOverriden?: boolean;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;
    useCustomFormat: boolean;
    labelTemplate: string;

    onValueLabelChange: (newValueLabel: PieChartValueLabel) => void;
    onToggleShowValue: (newValue: boolean) => void;
    onToggleShowPercentage: (newValue: boolean) => void;
    onToggleUseCustomFormat: () => void;
    onLabelTemplateChange: (newValue: string) => void;
    onResetLabelTemplate?: () => void;
};

export const ValueOptions: FC<ValueOptionsProps> = ({
    isValueLabelOverriden = false,
    isShowValueOverriden = false,
    isShowPercentageOverriden = false,
    isUseCustomFormatOverriden = false,
    isLabelTemplateOverriden = false,

    valueLabel,
    showValue,
    showPercentage,
    useCustomFormat,
    labelTemplate,

    onValueLabelChange,
    onToggleShowValue,
    onToggleShowPercentage,
    onToggleUseCustomFormat,
    onLabelTemplateChange,
    onResetLabelTemplate,
}) => {
    const { t } = useTranslation();

    const pieChartValueLabelAlias = {
        hidden: t(
            'components_visualization_configs_chart_pie.value_options.options.hidden',
        ),
        inside: t(
            'components_visualization_configs_chart_pie.value_options.options.inside',
        ),
        outside: t(
            'components_visualization_configs_chart_pie.value_options.options.outside',
        ),
        mixed: t(
            'components_visualization_configs_chart_pie.value_options.options.mixed',
        ),
    } as const;

    return (
        <>
            <Group spacing="xs" noWrap>
                <Config.Label>
                    {t(
                        'components_visualization_configs_chart_pie.value_options.value_position',
                    )}
                </Config.Label>
                <SegmentedControl
                    value={isValueLabelOverriden ? 'mixed' : valueLabel}
                    data={[
                        ...(isValueLabelOverriden ? [['mixed', 'Mixed']] : []),
                        ...Object.entries(PieChartValueLabels),
                    ].map(([value]) => ({
                        value,
                        label: pieChartValueLabelAlias[
                            value as PieChartValueLabel
                        ],
                        disabled: value === 'mixed',
                    }))}
                    onChange={(newValueLabel: PieChartValueLabel) => {
                        onValueLabelChange(newValueLabel);
                    }}
                />
            </Group>

            {valueLabel !== 'hidden' && (
                <Stack spacing="xs">
                    <Group spacing="xs">
                        <Checkbox
                            indeterminate={isShowValueOverriden}
                            checked={showValue}
                            onChange={(newValue) =>
                                onToggleShowValue(
                                    newValue.currentTarget.checked,
                                )
                            }
                            label={t(
                                'components_visualization_configs_chart_pie.value_options.show_value',
                            )}
                        />

                        <Checkbox
                            indeterminate={isShowPercentageOverriden}
                            checked={showPercentage}
                            onChange={(newValue) =>
                                onToggleShowPercentage(
                                    newValue.currentTarget.checked,
                                )
                            }
                            label={t(
                                'components_visualization_configs_chart_pie.value_options.show_percentage',
                            )}
                        />
                    </Group>

                    <Checkbox
                        indeterminate={isUseCustomFormatOverriden}
                        checked={useCustomFormat}
                        onChange={onToggleUseCustomFormat}
                        label={t(
                            'components_visualization_configs_chart_pie.value_options.use_custom_format',
                        )}
                    />

                    {useCustomFormat && (
                        <Stack spacing={4}>
                            <Group spacing="xs" noWrap>
                                {isLabelTemplateOverriden &&
                                onResetLabelTemplate ? (
                                    <Tooltip
                                        label={t(
                                            'components_visualization_configs_chart_pie.value_options.custom_format.reset',
                                        )}
                                        withinPortal
                                    >
                                        <ActionIcon
                                            size="sm"
                                            variant="subtle"
                                            onClick={onResetLabelTemplate}
                                        >
                                            <MantineIcon
                                                icon={IconRotateClockwise}
                                                size="1rem"
                                            />
                                        </ActionIcon>
                                    </Tooltip>
                                ) : null}
                            </Group>
                            <TextInput
                                value={labelTemplate}
                                onChange={(event) =>
                                    onLabelTemplateChange(
                                        event.currentTarget.value,
                                    )
                                }
                                placeholder={t(
                                    'components_visualization_configs_chart_pie.value_options.custom_format.placeholder',
                                    {
                                        example: '{percent}% - {value}',
                                    },
                                )}
                            />
                            <Text size="xs" c="gray.6">
                                {t(
                                    'components_visualization_configs_chart_pie.value_options.custom_format.hint',
                                    {
                                        tokens: '{name}, {value}, {percent}',
                                    },
                                )}
                            </Text>
                        </Stack>
                    )}
                </Stack>
            )}
        </>
    );
};
