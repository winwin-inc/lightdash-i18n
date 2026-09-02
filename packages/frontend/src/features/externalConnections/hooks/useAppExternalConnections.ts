// STUB: Phase C — external connections not wired for apps yet.
import type {
    AppExternalConnectionLink,
    ExternalConnection,
} from '@lightdash/common';

export const useAppExternalConnections = (
    _projectUuid?: string,
    _appUuid?: string,
) => ({
    data: [] as AppExternalConnectionLink[],
    isLoading: false,
    isInitialLoading: false,
});
