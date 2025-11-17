import {
    isField,
    type DashboardFilters,
    type FilterRule,
    type FilterableItem,
    type WeekDay,
} from '@lightdash/common';
import { type PopoverProps } from '@mantine/core';
import { useCallback, type ReactNode } from 'react';
import { v4 as uuid4 } from 'uuid';
import Context, { type DefaultFieldsMap } from './context';

type Props<T extends DefaultFieldsMap> = {
    projectUuid?: string;
    itemsMap?: T;
    baseTable?: string;
    startOfWeek?: WeekDay;
    dashboardFilters?: DashboardFilters;
    popoverProps?: Omit<PopoverProps, 'children'>;
    children?: ReactNode;
};

const FiltersProvider = <T extends DefaultFieldsMap = DefaultFieldsMap>({
    projectUuid,
    itemsMap = {} as T,
    baseTable,
    startOfWeek,
    dashboardFilters,
    popoverProps,
    children,
}: Props<T>) => {
    const getField = useCallback(
        (filterRule: FilterRule) => {
            if (itemsMap) {
                return itemsMap[filterRule.target.fieldId];
            }
        },
        [itemsMap],
    );
    const getAutocompleteFilterGroup = useCallback(
        (filterId: string, item: FilterableItem) => {
            if (!dashboardFilters || !isField(item)) {
                return undefined;
            }

            // Find the index of the current filter in the dimensions array
            const currentFilterIndex = dashboardFilters.dimensions.findIndex(
                (dimensionFilterRule) => dimensionFilterRule.id === filterId,
            );

            // If filter not found (creating new filter), include all filters for cascading
            // If filter found (editing existing filter), only include filters before it (left to right cascade)
            // This ensures that:
            // - When creating: new filter is affected by all existing filters
            // - When editing: filter is only affected by previous filters, not subsequent ones
            // - Global filters only affect subsequent global filters
            // - Tab filters are affected by all global filters (which come first) and previous tab filters
            return {
                id: uuid4(),
                and:
                    currentFilterIndex === -1
                        ? dashboardFilters.dimensions
                        : dashboardFilters.dimensions.slice(0, currentFilterIndex),
            };
        },
        [dashboardFilters],
    );
    return (
        <Context.Provider
            value={{
                projectUuid,
                itemsMap,
                startOfWeek,
                baseTable,
                getField,
                getAutocompleteFilterGroup,
                popoverProps,
            }}
        >
            {children}
        </Context.Provider>
    );
};

export default FiltersProvider;
