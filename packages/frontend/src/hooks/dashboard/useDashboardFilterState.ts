import { Dashboard } from '@lightdash/common';
import { useEffect, useState } from 'react';

export const useDashboardFilterState = ({
    dashboard,
}: {
    dashboard?: Dashboard;
}) => {
    // filter enabled states
    const [isGlobalFilterEnabled, setIsGlobalFilterEnabled] =
        useState<boolean>(true);
    const [isTabFilterEnabled, setIsTabFilterEnabled] = useState<
        Record<string, boolean>
    >({});
    const [showGlobalAddFilterButton, setShowGlobalAddFilterButton] =
        useState<boolean>(true);
    const [showTabAddFilterButton, setShowTabAddFilterButton] = useState<
        Record<string, boolean>
    >({});

    // Track filter enabled state changes
    const [haveFilterEnabledStatesChanged, setHaveFilterEnabledStatesChanged] =
        useState<boolean>(false);

    // Track show add filter button state changes
    const [
        haveShowAddFilterButtonStatesChanged,
        setHaveShowAddFilterButtonStatesChanged,
    ] = useState<boolean>(false);

    // Initialize filter enabled states from dashboard config when dashboard loads
    useEffect(() => {
        if (dashboard?.config) {
            const hasShowGlobalAddFilterButtonChanged =
                ((dashboard.config as any).showGlobalAddFilterButton ??
                    false) !== showGlobalAddFilterButton;
            const hasShowTabAddFilterButtonChanged =
                JSON.stringify(
                    (dashboard.config as any).showTabAddFilterButton || {},
                ) !== JSON.stringify(showTabAddFilterButton);

            setHaveShowAddFilterButtonStatesChanged(
                hasShowGlobalAddFilterButtonChanged ||
                    hasShowTabAddFilterButtonChanged,
            );
        }
    }, [dashboard?.config, showGlobalAddFilterButton, showTabAddFilterButton]);

    // Check if filter enabled states have changed from dashboard config
    useEffect(() => {
        if (dashboard?.config) {
            const hasGlobalFilterEnabledChanged =
                (dashboard.config as any).isGlobalFilterEnabled !==
                isGlobalFilterEnabled;
            const hasTabFilterEnabledChanged =
                JSON.stringify(
                    (dashboard.config as any).tabFilterEnabled || {},
                ) !== JSON.stringify(isTabFilterEnabled);

            setHaveFilterEnabledStatesChanged(
                hasGlobalFilterEnabledChanged || hasTabFilterEnabledChanged,
            );
        }
    }, [dashboard?.config, isGlobalFilterEnabled, isTabFilterEnabled]);

    return {
        isGlobalFilterEnabled,
        setIsGlobalFilterEnabled,
        isTabFilterEnabled,
        setIsTabFilterEnabled,
        haveFilterEnabledStatesChanged,
        setHaveFilterEnabledStatesChanged,
        showGlobalAddFilterButton,
        setShowGlobalAddFilterButton,
        showTabAddFilterButton,
        setShowTabAddFilterButton,
        haveShowAddFilterButtonStatesChanged,
        setHaveShowAddFilterButtonStatesChanged,
    };
};
