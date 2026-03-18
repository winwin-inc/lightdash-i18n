import {
    type DashboardFilterRule,
    type DashboardTile,
    type FilterableDimension,
} from '@lightdash/common';
import {
    Box,
    Button,
    Checkbox,
    Flex,
    Group,
    Modal,
    Stack,
    Text,
} from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { getCategoryLevel } from '../../utils/categoryFilters';

// 检测类目筛选器：基于字段名或 label
const detectCategoryLevel = (filter: DashboardFilterRule): number | null => {
    // 优先使用已设置的 categoryLevel
    const existingLevel = getCategoryLevel(filter);
    if (existingLevel) return existingLevel;

    // 基于字段名检测
    const fieldName = filter.target.fieldId.split('_').pop() || '';
    if (['cls1', 'cls_1'].includes(fieldName.toLowerCase())) return 1;
    if (['cls2', 'cls_2'].includes(fieldName.toLowerCase())) return 2;
    if (['cls3', 'cls_3'].includes(fieldName.toLowerCase())) return 3;
    if (['cls4', 'cls_4'].includes(fieldName.toLowerCase())) return 4;

    // 基于 label 检测
    const label = filter.label || filter.target.fieldLabel || '';
    if (label.includes('一级类目')) return 1;
    if (label.includes('二级类目')) return 2;
    if (label.includes('三级类目')) return 3;
    if (label.includes('四级类目')) return 4;

    return null;
};

interface BatchBindModalProps {
    opened: boolean;
    onClose: () => void;
    filters: DashboardFilterRule[];
    tiles: DashboardTile[];
    availableTileFilters: Record<string, FilterableDimension[] | undefined>;
    allFilterableFieldsMap: Record<string, FilterableDimension>;
    onApply: (updatedFilters: DashboardFilterRule[]) => void;
}

interface FilterBindingPreview {
    filter: DashboardFilterRule;
    currentTileCount: number;
    expectedTileCount: number;
    currentCategoryLevel?: 1 | 2 | 3 | 4;
    expectedCategoryLevel?: 1 | 2 | 3 | 4;
    currentParentFieldId?: string;
    expectedParentFieldId?: string;
}

const BatchBindModal: FC<BatchBindModalProps> = ({
    opened,
    onClose,
    filters,
    allFilterableFieldsMap,
    onApply,
}) => {
    const { t } = useTranslation();
    const [selectedFilterIds, setSelectedFilterIds] = useState<Set<string>>(
        new Set(),
    );

    // 计算每个筛选器的绑定预览
    const bindingPreviews = useMemo<FilterBindingPreview[]>(() => {
        const categoryFilters = filters
            .map((filter) => ({
                filter,
                categoryLevel: detectCategoryLevel(filter),
            }))
            .filter((item) => item.categoryLevel !== null);

        return categoryFilters.map(({ filter, categoryLevel }) => {
            const field = allFilterableFieldsMap[filter.target.fieldId];
            if (!field) {
                return {
                    filter,
                    currentTileCount: 0,
                    expectedTileCount: 0,
                };
            }

            // 计算 categoryLevel 变化
            const currentCategoryLevel = getCategoryLevel(filter) ?? undefined;
            const expectedCategoryLevel = categoryLevel as
                | 1
                | 2
                | 3
                | 4
                | undefined;

            // 计算父级筛选器
            let currentParentFieldId: string | undefined;
            let expectedParentFieldId: string | undefined;

            currentParentFieldId = (
                filter as DashboardFilterRule & { parentFieldId?: string }
            ).parentFieldId;

            if (categoryLevel && categoryLevel > 1) {
                // 查找对应的父级筛选器
                const targetParentLevel = categoryLevel - 1;
                const parentFilter = categoryFilters.find(
                    (item) => item.categoryLevel === targetParentLevel,
                )?.filter;
                expectedParentFieldId = parentFilter?.target.fieldId;
            }

            return {
                filter,
                currentTileCount: 0,
                expectedTileCount: 0,
                currentCategoryLevel,
                expectedCategoryLevel,
                currentParentFieldId,
                expectedParentFieldId,
            };
        });
    }, [filters, allFilterableFieldsMap]);

    // 初始化选中所有有变化的筛选器
    useMemo(() => {
        const changedFilterIds = new Set<string>();
        bindingPreviews.forEach((preview) => {
            const hasCategoryLevelChange =
                preview.currentCategoryLevel !== preview.expectedCategoryLevel;
            const hasParentChange =
                preview.currentParentFieldId !== preview.expectedParentFieldId;
            if (hasCategoryLevelChange || hasParentChange) {
                changedFilterIds.add(preview.filter.id);
            }
        });
        setSelectedFilterIds(changedFilterIds);
    }, [bindingPreviews]);

    const handleToggleFilter = useCallback((filterId: string) => {
        setSelectedFilterIds((prev) => {
            const next = new Set(prev);
            if (next.has(filterId)) {
                next.delete(filterId);
            } else {
                next.add(filterId);
            }
            return next;
        });
    }, []);

    const handleToggleAll = useCallback(() => {
        if (selectedFilterIds.size === bindingPreviews.length) {
            setSelectedFilterIds(new Set());
        } else {
            setSelectedFilterIds(
                new Set(bindingPreviews.map((p) => p.filter.id)),
            );
        }
    }, [selectedFilterIds.size, bindingPreviews]);

    const handleApply = useCallback(() => {
        const updatedFilters = filters.map((filter) => {
            if (!selectedFilterIds.has(filter.id)) {
                return filter;
            }

            const categoryLevel = detectCategoryLevel(filter);
            if (!categoryLevel) {
                return filter;
            }

            // 设置 categoryLevel 和 parentFieldId
            const updates: Partial<
                DashboardFilterRule & {
                    parentFieldId?: string;
                    categoryLevel?: 1 | 2 | 3 | 4;
                }
            > = {
                categoryLevel: categoryLevel as 1 | 2 | 3 | 4,
            };

            if (categoryLevel > 1) {
                const targetParentLevel = categoryLevel - 1;
                const parentFilter = filters.find(
                    (f) => detectCategoryLevel(f) === targetParentLevel,
                );
                if (parentFilter) {
                    updates.parentFieldId = parentFilter.target.fieldId;
                }
            }

            return {
                ...filter,
                ...updates,
            } as DashboardFilterRule & {
                parentFieldId?: string;
                categoryLevel?: 1 | 2 | 3 | 4;
            };
        });

        onApply(updatedFilters);
        onClose();
    }, [filters, selectedFilterIds, onApply, onClose]);

    const hasChanges = bindingPreviews.some(
        (preview) =>
            preview.currentCategoryLevel !== preview.expectedCategoryLevel ||
            preview.currentParentFieldId !== preview.expectedParentFieldId,
    );

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={t('components_dashboard_filter.batch_bind.title')}
            size="lg"
        >
            <Stack spacing="md">
                {!hasChanges && (
                    <Text size="sm" c="dimmed">
                        {t('components_dashboard_filter.batch_bind.no_changes')}
                    </Text>
                )}

                {hasChanges && (
                    <>
                        <Flex justify="space-between" align="center">
                            <Text size="sm" fw={500}>
                                {t(
                                    'components_dashboard_filter.batch_bind.select_filters',
                                )}
                            </Text>
                            <Button
                                variant="subtle"
                                size="xs"
                                onClick={handleToggleAll}
                            >
                                {selectedFilterIds.size ===
                                bindingPreviews.length
                                    ? t(
                                          'components_dashboard_filter.batch_bind.deselect_all',
                                      )
                                    : t(
                                          'components_dashboard_filter.batch_bind.select_all',
                                      )}
                            </Button>
                        </Flex>

                        <Stack spacing="xs">
                            {bindingPreviews.map((preview) => {
                                const hasCategoryLevelChange =
                                    preview.currentCategoryLevel !==
                                    preview.expectedCategoryLevel;
                                const hasParentChange =
                                    preview.currentParentFieldId !==
                                    preview.expectedParentFieldId;

                                if (!hasCategoryLevelChange && !hasParentChange)
                                    return null;

                                const categoryLevel =
                                    preview.expectedCategoryLevel;
                                const levelLabel = categoryLevel
                                    ? t(
                                          `components_dashboard_filter.configuration.category_level.level${categoryLevel}`,
                                      )
                                    : undefined;

                                return (
                                    <Box
                                        key={preview.filter.id}
                                        p="sm"
                                        sx={(theme) => ({
                                            border: `1px solid ${theme.colors.gray[3]}`,
                                            borderRadius: theme.radius.sm,
                                        })}
                                    >
                                        <Flex gap="md" align="flex-start">
                                            <Checkbox
                                                checked={selectedFilterIds.has(
                                                    preview.filter.id,
                                                )}
                                                onChange={() =>
                                                    handleToggleFilter(
                                                        preview.filter.id,
                                                    )
                                                }
                                                mt={2}
                                            />
                                            <Stack spacing={4} sx={{ flex: 1 }}>
                                                <Group spacing="xs">
                                                    <Text size="sm" fw={500}>
                                                        {preview.filter.label ||
                                                            preview.filter
                                                                .target
                                                                .fieldLabel ||
                                                            preview.filter
                                                                .target.fieldId}
                                                    </Text>
                                                    {levelLabel && (
                                                        <Text
                                                            size="xs"
                                                            c="dimmed"
                                                        >
                                                            • {levelLabel}
                                                        </Text>
                                                    )}
                                                </Group>

                                                {hasCategoryLevelChange && (
                                                    <Text size="xs" c="dimmed">
                                                        {t(
                                                            'components_dashboard_filter.batch_bind.category_level_change',
                                                            {
                                                                from: preview.currentCategoryLevel
                                                                    ? t(
                                                                          `components_dashboard_filter.configuration.category_level.level${preview.currentCategoryLevel}`,
                                                                      )
                                                                    : t(
                                                                          'components_dashboard_filter.batch_bind.unset',
                                                                      ),
                                                                to: preview.expectedCategoryLevel
                                                                    ? t(
                                                                          `components_dashboard_filter.configuration.category_level.level${preview.expectedCategoryLevel}`,
                                                                      )
                                                                    : t(
                                                                          'components_dashboard_filter.batch_bind.unset',
                                                                      ),
                                                            },
                                                        )}
                                                    </Text>
                                                )}

                                                {hasParentChange && (
                                                    <Text size="xs" c="dimmed">
                                                        {(() => {
                                                            const currentParent =
                                                                preview.currentParentFieldId
                                                                    ? filters.find(
                                                                          (f) =>
                                                                              f
                                                                                  .target
                                                                                  .fieldId ===
                                                                              preview.currentParentFieldId,
                                                                      )
                                                                    : null;
                                                            const expectedParent =
                                                                preview.expectedParentFieldId
                                                                    ? filters.find(
                                                                          (f) =>
                                                                              f
                                                                                  .target
                                                                                  .fieldId ===
                                                                              preview.expectedParentFieldId,
                                                                      )
                                                                    : null;

                                                            const currentLabel =
                                                                currentParent?.label ||
                                                                currentParent
                                                                    ?.target
                                                                    .fieldLabel ||
                                                                t(
                                                                    'components_dashboard_filter.batch_bind.none',
                                                                );
                                                            const expectedLabel =
                                                                expectedParent?.label ||
                                                                expectedParent
                                                                    ?.target
                                                                    .fieldLabel ||
                                                                t(
                                                                    'components_dashboard_filter.batch_bind.none',
                                                                );

                                                            return t(
                                                                'components_dashboard_filter.batch_bind.parent_filter_change',
                                                                {
                                                                    from: currentLabel,
                                                                    to: expectedLabel,
                                                                },
                                                            );
                                                        })()}
                                                    </Text>
                                                )}
                                            </Stack>
                                        </Flex>
                                    </Box>
                                );
                            })}
                        </Stack>
                    </>
                )}

                <Group position="right" mt="md">
                    <Button variant="subtle" onClick={onClose}>
                        {t('components_dashboard_filter.batch_bind.cancel')}
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={!hasChanges || selectedFilterIds.size === 0}
                    >
                        {t('components_dashboard_filter.batch_bind.apply')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default BatchBindModal;
