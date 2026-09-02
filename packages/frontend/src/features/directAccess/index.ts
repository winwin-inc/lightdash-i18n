// STUB: Phase C — Direct Access feature not wired in this fork yet.
import { type FC } from 'react';

export const DirectAccessModal: FC<Record<string, unknown>> = () => null;

export const useCanManageDirectAccess = (
    _args?: Record<string, unknown>,
): boolean => false;

export const useDirectAccessAvailability = (): {
    available: boolean;
    isAvailable: boolean;
} => ({
    available: false,
    isAvailable: false,
});
