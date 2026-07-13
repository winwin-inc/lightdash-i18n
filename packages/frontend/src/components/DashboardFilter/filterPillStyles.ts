import { createStyles } from '@mantine/core';

/** Shared max-width for dashboard filter pills (desktop vs mobile). */
export const useFilterPillStyles = createStyles(() => ({
    filterPill: {
        maxWidth: 'min(100%, 480px)',
        minWidth: 0,
        '@media (max-width: 768px)': {
            maxWidth: 'min(100%, calc(100vw - 32px))',
        },
    },
}));
