import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    emptyFilterMemoryState,
    getFilterMemoryStorageKey,
    readFilterMemory,
    removeFilterMemory,
    useDashboardFilterMemory,
    writeFilterMemory,
} from './useDashboardFilterMemory';

const dashboardUuid = 'dashboard-1';

describe('filter memory storage', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    it('returns an empty state when nothing is stored', () => {
        expect(readFilterMemory(dashboardUuid)).toEqual(emptyFilterMemoryState());
    });

    it('round-trips a state', () => {
        const state = {
            ...emptyFilterMemoryState(),
            updatedAt: 123,
            tab: {
                'dimension:orders.status': {
                    fingerprint: 'dimension:orders.status||',
                    operator: 'equals' as never,
                    values: ['x'],
                },
            },
        };
        writeFilterMemory(dashboardUuid, state);
        expect(readFilterMemory(dashboardUuid)).toEqual(state);
    });

    it('ignores a state written by another version', () => {
        localStorage.setItem(
            getFilterMemoryStorageKey(dashboardUuid),
            JSON.stringify({ version: 999, global: {}, tab: {} }),
        );
        expect(readFilterMemory(dashboardUuid)).toEqual(emptyFilterMemoryState());
    });

    it('ignores corrupted data', () => {
        localStorage.setItem(
            getFilterMemoryStorageKey(dashboardUuid),
            'not-json',
        );
        expect(readFilterMemory(dashboardUuid)).toEqual(emptyFilterMemoryState());
    });

    it('removes the stored state', () => {
        writeFilterMemory(dashboardUuid, {
            ...emptyFilterMemoryState(),
            updatedAt: 1,
        });
        removeFilterMemory(dashboardUuid);
        expect(readFilterMemory(dashboardUuid)).toEqual(emptyFilterMemoryState());
    });
});

describe('useDashboardFilterMemory', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
    });

    it('writes the selection after the debounce window', () => {
        const { result } = renderHook(() =>
            useDashboardFilterMemory({ dashboardUuid, enabled: true }),
        );

        act(() => {
            result.current.setSelection('tab', 'dimension:orders.status', {
                fingerprint: 'dimension:orders.status||',
                operator: 'equals' as never,
                values: ['x'],
            });
        });

        // not persisted yet
        expect(readFilterMemory(dashboardUuid).tab).toEqual({});

        act(() => {
            vi.advanceTimersByTime(600);
        });

        expect(
            readFilterMemory(dashboardUuid).tab[
                'dimension:orders.status'
            ].values,
        ).toEqual(['x']);
    });

    it('does not write when disabled (edit mode)', () => {
        const { result } = renderHook(() =>
            useDashboardFilterMemory({ dashboardUuid, enabled: false }),
        );

        act(() => {
            result.current.setSelection('tab', 'dimension:orders.status', {
                fingerprint: 'dimension:orders.status||',
                operator: 'equals' as never,
                values: ['x'],
            });
            vi.advanceTimersByTime(600);
        });

        expect(readFilterMemory(dashboardUuid).tab).toEqual({});
    });

    it('removes a selection', () => {
        const { result } = renderHook(() =>
            useDashboardFilterMemory({ dashboardUuid, enabled: true }),
        );

        act(() => {
            result.current.setSelection('tab', 'dimension:orders.status', {
                fingerprint: 'f',
                operator: 'equals' as never,
            });
            vi.advanceTimersByTime(600);
        });

        act(() => {
            result.current.removeSelection('tab', 'dimension:orders.status');
            vi.advanceTimersByTime(600);
        });

        expect(readFilterMemory(dashboardUuid).tab).toEqual({});
    });

    it('clears a whole scope', () => {
        const { result } = renderHook(() =>
            useDashboardFilterMemory({ dashboardUuid, enabled: true }),
        );

        act(() => {
            result.current.setSelection('global', 'dimension:orders.status', {
                fingerprint: 'f',
                operator: 'equals' as never,
            });
            result.current.setSelection('tab', 'dimension:orders.status', {
                fingerprint: 'f',
                operator: 'equals' as never,
            });
            vi.advanceTimersByTime(600);
        });

        act(() => {
            result.current.clearScope('global');
            vi.advanceTimersByTime(600);
        });

        const stored = readFilterMemory(dashboardUuid);
        expect(stored.global).toEqual({});
        expect(Object.keys(stored.tab)).toEqual(['dimension:orders.status']);
    });

    it('replaces the whole state (pruning)', () => {
        const { result } = renderHook(() =>
            useDashboardFilterMemory({ dashboardUuid, enabled: true }),
        );

        act(() => {
            result.current.setSelection('tab', 'dimension:orders.gone', {
                fingerprint: 'f',
                operator: 'equals' as never,
            });
            vi.advanceTimersByTime(600);
        });

        act(() => {
            result.current.replaceState({
                ...emptyFilterMemoryState(),
                updatedAt: Date.now(),
            });
            vi.advanceTimersByTime(600);
        });

        expect(readFilterMemory(dashboardUuid).tab).toEqual({});
    });
});
