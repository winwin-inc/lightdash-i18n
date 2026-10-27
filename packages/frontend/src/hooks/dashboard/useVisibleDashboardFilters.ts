import { useMemo } from 'react';

import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { emptyFilters } from './useDashboardFilters';

type Props = {
    filterScope: 'global' | 'tab';
    activeTabUuid: string | undefined;
    isEditMode: boolean;
};

type VisibleDashboardFilters = {
    /** There is at least one filter pill to show */
    hasVisibleFilters: boolean;
    /** The filter row has something to show, so it should be rendered */
    hasVisibleContent: boolean;
};

/**
 * Tells if the filter row of a given scope (global or tab) has something to
 * show.
 *
 * When it doesn't, the row must not be rendered at all: an empty row still
 * takes up space (padding + margins) and leaves a gap in the sticky stack of
 * the dashboard, which lets the content scroll through it.
 */
export const useVisibleDashboardFilters = ({
    filterScope,
    activeTabUuid,
    isEditMode,
}: Props): VisibleDashboardFilters => {
    const isGlobalFilterEnabled = useDashboardContext(
        (c) => c.isGlobalFilterEnabled,
    );
    const isTabFilterEnabled = useDashboardContext((c) => c.isTabFilterEnabled);
    const showGlobalAddFilterButton = useDashboardContext(
        (c) => c.showGlobalAddFilterButton,
    );
    const showTabAddFilterButton = useDashboardContext(
        (c) => c.showTabAddFilterButton,
    );
    const allFilters = useDashboardContext((c) => c.allFilters);
    const tabFilters = useDashboardContext((c) => c.tabFilters);
    const tabCategoryDisplayFilters = useDashboardContext(
        (c) => c.tabCategoryDisplayFilters,
    );
    const tabTemporaryFilters = useDashboardContext(
        (c) => c.tabTemporaryFilters,
    );

    const isFilterEnabled =
        filterScope === 'global'
            ? isGlobalFilterEnabled
            : isTabFilterEnabled[activeTabUuid || ''] ?? true;
    const showAddFilterButton =
        filterScope === 'global'
            ? showGlobalAddFilterButton
            : showTabAddFilterButton[activeTabUuid || ''] ?? false;

    const hasVisibleFilters = useMemo(() => {
        if (!isFilterEnabled) return false;

        if (filterScope === 'global') {
            // `allFilters` already includes the temporary filters
            return (allFilters?.dimensions ?? []).some(
                (dimension) => isEditMode || !dimension.hidden,
            );
        }

        const displayFilters =
            tabCategoryDisplayFilters?.[activeTabUuid || '']?.filters ??
            tabFilters?.[activeTabUuid || ''] ??
            emptyFilters;
        const temporaryFilters =
            tabTemporaryFilters?.[activeTabUuid || ''] ?? emptyFilters;

        return [
            ...(displayFilters.dimensions ?? []),
            ...(temporaryFilters.dimensions ?? []),
        ].some((dimension) => isEditMode || !dimension.hidden);
    }, [
        activeTabUuid,
        allFilters,
        filterScope,
        isEditMode,
        isFilterEnabled,
        tabCategoryDisplayFilters,
        tabFilters,
        tabTemporaryFilters,
    ]);

    return {
        hasVisibleFilters,
        // In edit mode the row always shows the filter toggle, in view mode it
        // only shows up when there is something to show
        hasVisibleContent:
            isEditMode ||
            (isFilterEnabled && (showAddFilterButton || hasVisibleFilters)),
    };
};
