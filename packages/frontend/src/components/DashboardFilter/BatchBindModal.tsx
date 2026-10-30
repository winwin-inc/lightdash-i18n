import { type DashboardFilterRule } from '@lightdash/common';
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
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { type CategoryLevel } from '../../utils/categoryLevel';
import {
    applyBatchCategoryBindingPlan,
    buildBatchCategoryBindingPlan,
    getImplicitCategoryLevelEntries,
    isBatchCategoryBindingEntryActionable,
    type BatchCategoryBindingEntry,
    type BatchCategoryBindingPlan,
    type CategoryBindingCandidate,
} from './common/batchCategoryBinding';

interface BatchBindModalProps {
    opened: boolean;
    onClose: () => void;
    /** 当前 Tab 的筛选器（批量绑定只写它们） */
    filters: DashboardFilterRule[];
    /** 全局筛选器：Tab 筛选器可以绑定全局父级（全局二级 → Tab 三级） */
    globalFilters?: DashboardFilterRule[];
    /** 当前 Tab uuid（父级在同 Tab 时写入） */
    tabUuid?: string;
    /**
     * 本次批量绑定的目标作用域：
     * - tab（默认）：写当前 Tab，父级可以是本 Tab 或全局
     * - global：写全局筛选器，父级只能是全局
     */
    scope?: 'global' | 'tab';
    onApply: (updatedFilters: DashboardFilterRule[]) => void;
}

const getFilterDisplayName = (filter: DashboardFilterRule): string =>
    filter.label || filter.target.fieldLabel || filter.target.fieldId;

/** 稳定的空数组：避免默认参数每次渲染都产生新引用，导致 plan / effect 无限重算 */
const EMPTY_FILTERS: DashboardFilterRule[] = [];

const BatchBindModal: FC<BatchBindModalProps> = ({
    opened,
    onClose,
    filters,
    globalFilters = EMPTY_FILTERS,
    tabUuid,
    scope = 'tab',
    onApply,
}) => {
    const { t } = useTranslation();
    const [selectedFilterIds, setSelectedFilterIds] = useState<
        ReadonlySet<string>
    >(() => new Set());

    const plan = useMemo<BatchCategoryBindingPlan>(
        () =>
            buildBatchCategoryBindingPlan({
                filters,
                globalFilters,
                tabUuid: tabUuid ?? null,
                scope,
            }),
        [filters, globalFilters, tabUuid, scope],
    );

    const actionableEntries = useMemo(
        () => plan.filter(isBatchCategoryBindingEntryActionable),
        [plan],
    );
    // 展示全部识别到的类目筛选器（按层级排序）：即使没有变化也要能看到
    // 当前绑定关系，否则「三级/四级已绑定」会被误认为批量绑定没生效
    const orderedEntries = useMemo(
        () =>
            plan
                .map((entry, index) => ({ entry, index }))
                .sort(
                    (a, b) =>
                        a.entry.categoryLevel - b.entry.categoryLevel ||
                        a.index - b.index,
                )
                .map(({ entry }) => entry),
        [plan],
    );

    // 被选中的子级依赖的父级层级：会自动写入，但不受勾选控制
    const implicitLevelFilterIds = useMemo(
        () =>
            new Set(
                getImplicitCategoryLevelEntries(plan, selectedFilterIds).map(
                    (entry) => entry.filter.id,
                ),
            ),
        [plan, selectedFilterIds],
    );

    // 编辑模式的批量绑定 = 构建绑定关系：默认勾选全部类目筛选器，
    // 作者只需取消不想改的条目（无需把行做成禁用态）
    useEffect(() => {
        if (!opened) return;
        setSelectedFilterIds(new Set(plan.map((entry) => entry.filter.id)));
    }, [opened, plan]);

    const levelLabel = useCallback(
        (level: CategoryLevel) =>
            t(
                `components_dashboard_filter.configuration.category_level.level${level}`,
            ),
        [t],
    );

    const scopeLabel = useCallback(
        (candidateScope: CategoryBindingCandidate['scope']) =>
            candidateScope === 'global'
                ? t(
                      'components_dashboard_filter.configuration.category_level.parent_scope_global',
                  )
                : t(
                      'components_dashboard_filter.configuration.category_level.parent_scope_tab',
                  ),
        [t],
    );

    const candidateLabel = useCallback(
        (candidate: CategoryBindingCandidate) =>
            t(
                'components_dashboard_filter.configuration.category_level.parent_option_label',
                {
                    label: getFilterDisplayName(candidate.rule),
                    level: levelLabel(candidate.level),
                    scope: scopeLabel(candidate.scope),
                },
            ),
        [levelLabel, scopeLabel, t],
    );

    const currentParentLabel = useCallback(
        (entry: BatchCategoryBindingEntry) =>
            entry.currentParent
                ? candidateLabel(entry.currentParent)
                : entry.filter.parentFieldId ??
                  t('components_dashboard_filter.batch_bind.none'),
        [candidateLabel, t],
    );

    const resolvedParentLabel = useCallback(
        (entry: BatchCategoryBindingEntry) =>
            entry.resolvedParent
                ? candidateLabel(entry.resolvedParent)
                : t('components_dashboard_filter.batch_bind.none'),
        [candidateLabel, t],
    );

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
        const allSelected = plan.every((entry) =>
            selectedFilterIds.has(entry.filter.id),
        );
        setSelectedFilterIds(
            allSelected
                ? new Set()
                : new Set(plan.map((entry) => entry.filter.id)),
        );
    }, [plan, selectedFilterIds]);

    const handleApply = useCallback(() => {
        onApply(
            applyBatchCategoryBindingPlan(filters, plan, selectedFilterIds),
        );
        onClose();
    }, [filters, plan, selectedFilterIds, onApply, onClose]);

    const hasChanges = actionableEntries.length > 0;
    const selectedCount = plan.filter((entry) =>
        selectedFilterIds.has(entry.filter.id),
    ).length;
    const allSelected = plan.length > 0 && selectedCount === plan.length;

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={t('components_dashboard_filter.batch_bind.title')}
            size="lg"
        >
            <Stack spacing="md">
                <Text size="xs" c="dimmed">
                    {t(
                        scope === 'global'
                            ? 'components_dashboard_filter.batch_bind.bind_hint_global'
                            : 'components_dashboard_filter.batch_bind.bind_hint',
                    )}
                </Text>

                {plan.length === 0 && (
                    <Text size="sm" c="dimmed">
                        {t(
                            'components_dashboard_filter.batch_bind.no_category_filters',
                        )}
                    </Text>
                )}

                {plan.length > 0 && !hasChanges && (
                    <Text size="sm" c="dimmed">
                        {t('components_dashboard_filter.batch_bind.no_changes')}
                    </Text>
                )}

                {plan.length > 0 && (
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
                                {allSelected
                                    ? t(
                                          'components_dashboard_filter.batch_bind.deselect_all',
                                      )
                                    : t(
                                          'components_dashboard_filter.batch_bind.select_all',
                                      )}
                            </Button>
                        </Flex>
                    </>
                )}

                {orderedEntries.length > 0 && (
                    <Stack spacing="xs">
                        {orderedEntries.map((entry) => {
                            const implicit = implicitLevelFilterIds.has(
                                entry.filter.id,
                            );
                            return (
                                <Box
                                    key={entry.filter.id}
                                    p="sm"
                                    sx={(theme) => ({
                                        border: `1px solid ${theme.colors.gray[3]}`,
                                        borderRadius: theme.radius.sm,
                                    })}
                                >
                                    <Flex gap="md" align="flex-start">
                                        <Checkbox
                                            aria-label={getFilterDisplayName(
                                                entry.filter,
                                            )}
                                            checked={
                                                selectedFilterIds.has(
                                                    entry.filter.id,
                                                ) || implicit
                                            }
                                            disabled={implicit}
                                            onChange={() =>
                                                handleToggleFilter(
                                                    entry.filter.id,
                                                )
                                            }
                                            mt={2}
                                        />
                                        <Stack spacing={4} sx={{ flex: 1 }}>
                                            <Group spacing="xs">
                                                <Text size="sm" fw={500}>
                                                    {getFilterDisplayName(
                                                        entry.filter,
                                                    )}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    •{' '}
                                                    {levelLabel(
                                                        entry.categoryLevel,
                                                    )}
                                                </Text>
                                            </Group>

                                            {entry.categoryLevelChanged && (
                                                <Text size="xs" c="dimmed">
                                                    {t(
                                                        'components_dashboard_filter.batch_bind.category_level_change',
                                                        {
                                                            from: entry.filter
                                                                .categoryLevel
                                                                ? levelLabel(
                                                                      entry
                                                                          .filter
                                                                          .categoryLevel,
                                                                  )
                                                                : t(
                                                                      'components_dashboard_filter.batch_bind.unset',
                                                                  ),
                                                            to: levelLabel(
                                                                entry.categoryLevel,
                                                            ),
                                                        },
                                                    )}
                                                </Text>
                                            )}

                                            {entry.parentChanged && (
                                                <Text size="xs" c="dimmed">
                                                    {t(
                                                        'components_dashboard_filter.batch_bind.parent_filter_change',
                                                        {
                                                            from: currentParentLabel(
                                                                entry,
                                                            ),
                                                            to: resolvedParentLabel(
                                                                entry,
                                                            ),
                                                        },
                                                    )}
                                                </Text>
                                            )}

                                            {!entry.parentChanged &&
                                                entry.currentParent !==
                                                    null && (
                                                    <Text size="xs" c="green">
                                                        {t(
                                                            'components_dashboard_filter.batch_bind.parent_bound',
                                                            {
                                                                parent: candidateLabel(
                                                                    entry.currentParent,
                                                                ),
                                                            },
                                                        )}
                                                    </Text>
                                                )}

                                            {entry.skipReason ===
                                                'parent-missing-level' && (
                                                <Text size="xs" c="orange">
                                                    {t(
                                                        'components_dashboard_filter.batch_bind.unbound_no_parent',
                                                    )}
                                                </Text>
                                            )}

                                            {entry.skipReason ===
                                                'orphan-parent' && (
                                                <Text size="xs" c="orange">
                                                    {t(
                                                        'components_dashboard_filter.batch_bind.orphan_parent',
                                                    )}
                                                </Text>
                                            )}

                                            {entry.skipReason === null &&
                                                !entry.parentChanged &&
                                                entry.currentParent ===
                                                    null && (
                                                    <Text size="xs" c="dimmed">
                                                        {t(
                                                            'components_dashboard_filter.batch_bind.root_no_parent',
                                                        )}
                                                    </Text>
                                                )}

                                            {entry.ambiguousParentCandidates && (
                                                <Text size="xs" c="orange">
                                                    {t(
                                                        'components_dashboard_filter.batch_bind.ambiguous_parent',
                                                    )}
                                                </Text>
                                            )}

                                            {implicit && (
                                                <Text size="xs" c="dimmed">
                                                    {t(
                                                        'components_dashboard_filter.batch_bind.implicit_level',
                                                    )}
                                                </Text>
                                            )}
                                        </Stack>
                                    </Flex>
                                </Box>
                            );
                        })}
                    </Stack>
                )}

                <Group position="right" mt="md">
                    <Button variant="subtle" onClick={onClose}>
                        {t('components_dashboard_filter.batch_bind.cancel')}
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={selectedCount === 0}
                    >
                        {t('components_dashboard_filter.batch_bind.apply')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default BatchBindModal;
