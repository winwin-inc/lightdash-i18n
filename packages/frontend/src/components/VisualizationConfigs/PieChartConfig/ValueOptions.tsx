// TODO: Move to Series/ folder after refactor

import {
    PieChartValueLabels,
    type PieChartValueLabel,
} from '@lightdash/common';
import { Checkbox, Group, SegmentedControl } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Config } from '../common/Config';

type ValueOptionsProps = {
    isValueLabelOverriden?: boolean;
    isShowValueOverriden?: boolean;
    isShowPercentageOverriden?: boolean;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;

    onValueLabelChange: (newValueLabel: PieChartValueLabel) => void;
    onToggleShowValue: (newValue: boolean) => void;
    onToggleShowPercentage: (newValue: boolean) => void;
};

export const ValueOptions: FC<ValueOptionsProps> = ({
    isValueLabelOverriden = false,
    isShowValueOverriden = false,
    isShowPercentageOverriden = false,

    valueLabel,
    showValue,
    showPercentage,

    onValueLabelChange,
    onToggleShowValue,
    onToggleShowPercentage,
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
                        label: pieChartValueLabelAlias[value as PieChartValueLabel],
                        disabled: value === 'mixed',
                    }))}
                    onChange={(newValueLabel: PieChartValueLabel) => {
                        onValueLabelChange(newValueLabel);
                    }}
                />
            </Group>

            {valueLabel !== 'hidden' && (
                <Group spacing="xs">
                    <Checkbox
                        indeterminate={isShowValueOverriden}
                        checked={showValue}
                        onChange={(newValue) =>
                            onToggleShowValue(newValue.currentTarget.checked)
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
            )}
        </>
    );
};
