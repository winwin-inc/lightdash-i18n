import { type ApiError, type FeatureFlag } from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

/**
 * Get a feature flag value from the backend (DB-backed / env allowlists).
 * Named to match upstream mergeQuery imports; wraps the same endpoint as
 * `useFeatureFlag` in this fork.
 */
export const useServerFeatureFlag = (
    featureFlagId: string,
    options?: { retry?: number | boolean },
) => {
    return useQuery<FeatureFlag, ApiError>(
        ['feature-flag', featureFlagId],
        () => {
            return lightdashApi<FeatureFlag>({
                url: `/feature-flag/${featureFlagId}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            });
        },
        {
            retry: options?.retry ?? false,
            refetchOnMount: false,
        },
    );
};
