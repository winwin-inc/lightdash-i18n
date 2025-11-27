// TODO: Move to Series/ folder after refactor

import { type DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import {
    type PieChartValueLabel,
    type PieChartValueOptions,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Collapse,
    Group,
    Stack,
    Tooltip,
    type StackProps,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import ColorSelector from '../ColorSelector';
import { EditableText } from '../common/EditableText';
import { GrabIcon } from '../common/GrabIcon';
import { ValueOptions } from './ValueOptions';

type GroupItemProps = {
    isOnlyItem: boolean;

    dragHandleProps?: DraggableProvidedDragHandleProps | null;

    defaultColor: string;
    defaultLabel: string;

    swatches: string[];

    color: string | undefined;
    label: string | undefined;

    valueLabel: PieChartValueLabel;
    showValue: boolean;
    showPercentage: boolean;
    useCustomFormat: boolean;
    labelTemplate: string;
    isLabelTemplateOverriden: boolean;

    onColorChange: (label: string, newColor: string) => void;
    onLabelChange: (label: string, newLabel: string) => void;
    onValueOptionsChange: (
        label: string,
        newOptions: Partial<PieChartValueOptions>,
    ) => void;
    onResetLabelTemplate: (label: string) => void;
};

export const GroupItem = forwardRef<
    HTMLDivElement,
    StackProps & GroupItemProps
>(
    (
        {
            isOnlyItem,

            dragHandleProps,

            defaultLabel,
            defaultColor,

            swatches,

            label,
            color,

            valueLabel,
            showValue,
            showPercentage,
            useCustomFormat,
            labelTemplate,
            isLabelTemplateOverriden,

            onColorChange,
            onLabelChange,
            onValueOptionsChange,
            onResetLabelTemplate,

            ...rest
        },
        ref,
    ) => {
        const { t } = useTranslation();
        const [opened, { toggle }] = useDisclosure();

        return (
            <Stack ref={ref} spacing="xs" {...rest}>
                <Group spacing="xs">
                    {!isOnlyItem && (
                        <GrabIcon dragHandleProps={dragHandleProps} />
                    )}

                    <ColorSelector
                        color={color}
                        defaultColor={defaultColor}
                        swatches={swatches}
                        onColorChange={(newColor: string) =>
                            onColorChange(defaultLabel, newColor)
                        }
                    />
                    <Box style={{ flexGrow: 1 }}>
                        <EditableText
                            placeholder={defaultLabel}
                            value={label}
                            onChange={(event) => {
                                onLabelChange(
                                    defaultLabel,
                                    event.currentTarget.value,
                                );
                            }}
                        />
                    </Box>

                    <Tooltip
                        variant="xs"
                        label={t(
                            'components_visualization_configs_chart_pie.override_value_label_options',
                        )}
                        withinPortal
                    >
                        <ActionIcon onClick={toggle}>
                            <MantineIcon
                                icon={opened ? IconChevronUp : IconChevronDown}
                            />
                        </ActionIcon>
                    </Tooltip>
                </Group>

                <Collapse in={opened}>
                    <Stack ml="xl" spacing="xs" pb="xs">
                        <ValueOptions
                            valueLabel={valueLabel}
                            onValueLabelChange={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    valueLabel: newValue,
                                })
                            }
                            showValue={showValue}
                            onToggleShowValue={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    showValue: newValue,
                                })
                            }
                            showPercentage={showPercentage}
                            onToggleShowPercentage={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    showPercentage: newValue,
                                })
                            }
                            useCustomFormat={useCustomFormat}
                            onToggleUseCustomFormat={() =>
                                onValueOptionsChange(defaultLabel, {
                                    useCustomFormat: !useCustomFormat,
                                })
                            }
                            labelTemplate={labelTemplate}
                            isLabelTemplateOverriden={isLabelTemplateOverriden}
                            onLabelTemplateChange={(newValue) =>
                                onValueOptionsChange(defaultLabel, {
                                    labelTemplate: newValue,
                                })
                            }
                            onResetLabelTemplate={() =>
                                onResetLabelTemplate(defaultLabel)
                            }
                        />
                    </Stack>
                </Collapse>
            </Stack>
        );
    },
);
