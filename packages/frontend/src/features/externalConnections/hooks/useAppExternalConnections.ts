// STUB: returns empty linked connections until External Connections API is ported.
import { type AppExternalConnectionLinked } from '@lightdash/common';

export const useAppExternalConnections = (
    _projectUuid: string | undefined,
    _appUuid: string | undefined,
) => ({
    data: [] as AppExternalConnectionLinked[],
    isInitialLoading: false,
    isLoading: false,
});
