import {
    applyDimensionOverrides,
    getUnmetFilterRequirements,
    ParameterError,
    type DashboardFilterRule,
    type DashboardFilters,
    type UpdateSchedulerAndTargetsWithoutId,
} from '@lightdash/common';

/**
 * Hard-gate dashboard scheduled deliveries when filter requirements are unmet.
 * Uses the saved dashboard rules overlaid with scheduler dimension overrides —
 * same semantic core as the frontend SchedulerForm check (without tab-field
 * scoping, which needs runtime filterable-field maps).
 */
export const assertDashboardSchedulerFilterRequirementsMet = ({
    savedDashboardFilters,
    schedulerFilters,
}: {
    savedDashboardFilters: DashboardFilters;
    schedulerFilters: DashboardFilterRule[] | undefined;
}): void => {
    const effectiveFilters: DashboardFilters = {
        ...savedDashboardFilters,
        dimensions: applyDimensionOverrides(
            savedDashboardFilters,
            schedulerFilters ?? [],
        ),
    };

    const unmet = getUnmetFilterRequirements(effectiveFilters);
    if (unmet.length === 0) {
        return;
    }

    const onlyGroups = unmet.every((requirement) => requirement.type === 'group');
    throw new ParameterError(
        onlyGroups
            ? 'Set a value for at least one filter in each requirement group'
            : 'Required filters must have values',
    );
};

export const getSchedulerFiltersFromUpdate = (
    updatedScheduler: UpdateSchedulerAndTargetsWithoutId,
): DashboardFilterRule[] | undefined =>
    'filters' in updatedScheduler ? updatedScheduler.filters : undefined;
