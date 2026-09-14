// STUB: Phase C — external connections not wired for apps yet.
import type { ExternalConnection } from '@lightdash/common';

export const useExternalConnections = (_projectUuid?: string) => ({
    data: [] as ExternalConnection[],
    isLoading: false,
    isInitialLoading: false,
});
