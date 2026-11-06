import {
    type ApiError,
    type ApiGetAuthenticatedUserResponse,
    type ViewerContentScopeDiagnostics,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';

import { lightdashApi } from '../api';

export type MyContentScope = ViewerContentScopeDiagnostics;

/**
 * Diagnostics of the client-use content scope for the current user.
 *
 * The data comes from `GET /api/v1/user?projectUuid=`: the user payload
 * carries a `clientUse` block that explains which dashboards the user can
 * see in that project and why (allow-list empty, RPC failure, role not
 * restricted, ...).
 *
 * The query is intentionally not retried and errors are swallowed by the
 * caller so that a failing diagnostics call never blocks the page.
 */
export const useMyContentScope = (projectUuid: string | undefined) =>
    useQuery<MyContentScope, ApiError>({
        queryKey: ['my_content_scope', projectUuid],
        queryFn: async () => {
            const response =
                await lightdashApi<ApiGetAuthenticatedUserResponse>({
                    url: `/user?projectUuid=${encodeURIComponent(
                        projectUuid as string,
                    )}`,
                    method: 'GET',
                    body: undefined,
                });
            const clientUse = response.results.clientUse;
            if (clientUse === undefined) {
                throw new Error('Missing client-use diagnostics');
            }
            return clientUse;
        },
        enabled: !!projectUuid,
        retry: false,
    });
