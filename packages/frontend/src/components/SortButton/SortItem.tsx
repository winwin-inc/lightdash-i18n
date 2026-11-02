import {
    type DraggableProvidedDraggableProps,
    type DraggableProvidedDragHandleProps,
} from '@hello-pangea/dnd';
import {
    DimensionType,
    getItemLabelWithoutTableName,
    isDimension,
    type FilterableDimension,
    type SortField,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    SegmentedControl,
    Stack,
    Text,
    Tooltip,
    UnstyledButton,
} from '@mantine/core';
import { IconGripVertical, IconListNumbers, IconX } from '@tabler/icons-react';
import { forwardRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    canUseValueOrder,
    getSortDirectionOrder,
    getSortLabel,
    getSortNullsFirstValue,
    getValueOrderSortLabel,
    SortDirection,
    SortNullsFirst,
    sortNullsFirstLabels,
} from '../../utils/sortUtils';
import MantineIcon from '../common/MantineIcon';
import { type TableColumn } from '../common/Table/types';
import ValueOrderEditorContainer from './ValueOrderEditorContainer';

interface SortItemProps {
    isFirstItem: boolean;
    isOnlyItem: boolean;
    isDragging: boolean;
    isEditMode: boolean;
    sort: SortField;
    column?: TableColumn;
    draggableProps: DraggableProvidedDraggableProps;
    dragHandleProps?: DraggableProvidedDragHandleProps | null;
    onAddSortField: (options: { descending: boolean }) => void;
    onRemoveSortField: () => void;
    onSetSortFieldNullsFirst: (nullsFirst: boolean | undefined) => void;
    onSetSortFieldValueOrder: (valueOrder: string[] | undefined) => void;
}

const SortItem = forwardRef<HTMLDivElement, SortItemProps>(
    (
        {
            isFirstItem,
            isOnlyItem,
            isDragging,
            isEditMode,
            sort,
            column,
            draggableProps,
            dragHandleProps,
            onAddSortField,
            onRemoveSortField,
            onSetSortFieldNullsFirst,
            onSetSortFieldValueOrder,
        },
        ref,
    ) => {
        const { t } = useTranslation();
        const [isValueOrderEditorOpen, setIsValueOrderEditorOpen] =
            useState(false);

        const selectedSortDirection = sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC;

        const item = column?.meta?.item;

        const selectedSortNullsFirst = getSortNullsFirstValue(sort);

        const valueOrder = sort.valueOrder ?? [];
        const hasValueOrder = valueOrder.length > 0;
        // 编辑中或已配置：这一行切换成「自定义顺序」布局（方向变正序/反序，隐藏空值）
        const isValueOrderMode = hasValueOrder || isValueOrderEditorOpen;

        // The custom value order only makes sense for string dimensions.
        // `canUseValueOrder` tells us whether the feature applies to this
        // item, the narrowing below gives us the field to query the values of.
        const canUseCustomOrder = canUseValueOrder(item);
        const valueOrderField: FilterableDimension | undefined =
            isDimension(item) && item.type === DimensionType.STRING
                ? item
                : undefined;

        // 收起时只露前 2 个值，剩下的用 +N 表示；完整顺序在 tooltip 里
        const valueOrderSummary =
            valueOrder.length === 0
                ? t('components_sort_button.custom_order_add_values')
                : valueOrder.length > 2
                ? `${valueOrder.slice(0, 2).join(' → ')} +${
                      valueOrder.length - 2
                  }`
                : valueOrder.join(' → ');

        const handleValueOrderChange = useCallback(
            (newValues: string[]) => {
                // An empty list means that the custom order is turned off
                onSetSortFieldValueOrder(
                    newValues.length > 0 ? newValues : undefined,
                );
            },
            [onSetSortFieldValueOrder],
        );

        const handleToggleValueOrderEditor = useCallback(() => {
            setIsValueOrderEditorOpen((isOpen) => !isOpen);
        }, []);

        if (!item) {
            return null;
        }

        return (
            <Stack spacing="xs">
                <Group
                    ref={ref}
                    {...draggableProps}
                    noWrap
                    position="apart"
                    bg="white"
                    pl="xs"
                    pr="xxs"
                    py="two"
                    miw={560}
                    sx={(theme) => ({
                        borderRadius: theme.radius.sm,
                        transition: 'all 100ms ease',
                        boxShadow: isDragging ? theme.shadows.md : 'none',
                    })}
                >
                    <Group spacing="sm">
                        {isEditMode && !isOnlyItem && (
                            <Box
                                {...dragHandleProps}
                                sx={{
                                    opacity: 0.6,
                                    '&:hover': { opacity: 1 },
                                }}
                            >
                                <MantineIcon icon={IconGripVertical} />
                            </Box>
                        )}

                        <Text>
                            {isFirstItem
                                ? t('components_sort_button.sort_by')
                                : t('components_sort_button.then_by')}
                        </Text>

                        <Text fw={500}>
                            {getItemLabelWithoutTableName(item) || sort.fieldId}
                        </Text>
                    </Group>

                    <Group spacing="xs">
                        {canUseCustomOrder && (
                            <Tooltip
                                label={t(
                                    'components_sort_button.custom_order_tooltip',
                                )}
                                withArrow
                                position="top"
                            >
                                <ActionIcon
                                    size="sm"
                                    disabled={!isEditMode}
                                    variant={
                                        isValueOrderMode ? 'light' : 'subtle'
                                    }
                                    color={hasValueOrder ? 'blue' : 'gray'}
                                    aria-label={t(
                                        'components_sort_button.custom_order',
                                    )}
                                    onClick={handleToggleValueOrderEditor}
                                >
                                    <MantineIcon
                                        icon={IconListNumbers}
                                        size="sm"
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        <SegmentedControl
                            disabled={!isEditMode}
                            value={selectedSortDirection}
                            size="xs"
                            color="blue"
                            data={getSortDirectionOrder(item).map(
                                (direction) => ({
                                    label: isValueOrderMode
                                        ? getValueOrderSortLabel(direction, t)
                                        : getSortLabel(item, direction, t),
                                    value: direction,
                                }),
                            )}
                            onChange={(value) => {
                                onAddSortField({
                                    descending: value === SortDirection.DESC,
                                });
                            }}
                        />

                        {isValueOrderMode && !isValueOrderEditorOpen && (
                            <Tooltip
                                label={valueOrder.join(' → ')}
                                withArrow
                                position="top"
                                disabled={valueOrder.length === 0}
                            >
                                <UnstyledButton
                                    onClick={handleToggleValueOrderEditor}
                                    data-testid="value-order-summary"
                                    sx={(theme) => ({
                                        width: 190,
                                        padding: `2px ${theme.spacing.xs}`,
                                        borderRadius: theme.radius.sm,
                                        border: `1px dashed ${theme.colors.gray[3]}`,
                                    })}
                                >
                                    <Text size="xs" color="dimmed" truncate>
                                        {valueOrderSummary}
                                    </Text>
                                </UnstyledButton>
                            </Tooltip>
                        )}

                        {isValueOrderMode && isValueOrderEditorOpen && valueOrderField && (
                            <Box sx={{ width: 190 }}>
                                <ValueOrderEditorContainer
                                    field={valueOrderField}
                                    values={valueOrder}
                                    onChange={handleValueOrderChange}
                                />
                            </Box>
                        )}

                        {!isValueOrderMode && (
                            <Text ml="lg" fw={500}>
                                {t('components_sort_button.nulls')}
                            </Text>
                        )}

                        {!isValueOrderMode && (
                            <SegmentedControl
                                disabled={!isEditMode}
                                value={selectedSortNullsFirst}
                                size="xs"
                                color="blue"
                                data={Object.entries(sortNullsFirstLabels).map(
                                    ([value, labelKey]) => ({
                                        label: t(labelKey),
                                        value,
                                    }),
                                )}
                                onChange={(value) => {
                                    onSetSortFieldNullsFirst(
                                        value === SortNullsFirst.FIRST
                                            ? true
                                            : value === SortNullsFirst.LAST
                                            ? false
                                            : undefined,
                                    );
                                }}
                            />
                        )}

                        {isEditMode && (
                            <ActionIcon onClick={onRemoveSortField} size="sm">
                                <MantineIcon icon={IconX} />
                            </ActionIcon>
                        )}
                    </Group>
                </Group>

            </Stack>
        );
    },
);

export default SortItem;
