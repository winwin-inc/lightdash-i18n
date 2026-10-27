import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
    type FilterMemoryEntry,
    type UserFilterSelections,
} from '../../utils/userFilterSelections';

const MEMORY_KEY_PREFIX = 'lightdash:dashboard-filter-memory:';
const MEMORY_VERSION = 1;
const WRITE_DEBOUNCE_MS = 500;

export type { FilterMemoryEntry };

export type FilterMemoryState = {
    version: number;
    updatedAt: number;
    global: Record<string, FilterMemoryEntry>;
    tab: Record<string, FilterMemoryEntry>;
};

export const emptyFilterMemoryState = (): FilterMemoryState => ({
    version: MEMORY_VERSION,
    updatedAt: 0,
    global: {},
    tab: {},
});

export const getFilterMemoryStorageKey = (dashboardUuid: string): string =>
    `${MEMORY_KEY_PREFIX}${dashboardUuid}`;

/**
 * 读取本地记忆。版本不匹配或数据损坏时返回空状态（等价于「没有记忆」）。
 */
export const readFilterMemory = (
    dashboardUuid: string | undefined,
): FilterMemoryState => {
    if (!dashboardUuid || typeof localStorage === 'undefined') {
        return emptyFilterMemoryState();
    }
    try {
        const raw = localStorage.getItem(
            getFilterMemoryStorageKey(dashboardUuid),
        );
        if (!raw) {
            return emptyFilterMemoryState();
        }
        const parsed = JSON.parse(raw) as FilterMemoryState;
        if (
            !parsed ||
            parsed.version !== MEMORY_VERSION ||
            typeof parsed.global !== 'object' ||
            typeof parsed.tab !== 'object'
        ) {
            return emptyFilterMemoryState();
        }
        return {
            version: MEMORY_VERSION,
            updatedAt: parsed.updatedAt ?? 0,
            global: parsed.global ?? {},
            tab: parsed.tab ?? {},
        };
    } catch (e) {
        return emptyFilterMemoryState();
    }
};

export const writeFilterMemory = (
    dashboardUuid: string | undefined,
    state: FilterMemoryState,
): void => {
    if (!dashboardUuid || typeof localStorage === 'undefined') {
        return;
    }
    try {
        localStorage.setItem(
            getFilterMemoryStorageKey(dashboardUuid),
            JSON.stringify(state),
        );
    } catch (e) {
        // localStorage 不可用（隐私模式 / 配额满）时静默降级：不记忆即可
    }
};

export const removeFilterMemory = (
    dashboardUuid: string | undefined,
): void => {
    if (!dashboardUuid || typeof localStorage === 'undefined') {
        return;
    }
    try {
        localStorage.removeItem(getFilterMemoryStorageKey(dashboardUuid));
    } catch (e) {
        // ignore
    }
};

type UseDashboardFilterMemoryArgs = {
    dashboardUuid: string | undefined;
    /** 只在查看模式读写记忆 */
    enabled: boolean;
};

/**
 * 本地记忆：记住用户最后一次的显式选择，重新进入看板时恢复。
 *
 * 只保存用户显式选择，类目级联派生值与权限回退值都不写进来
 * （它们是「当前 Tab 下的合法值」，不是用户意图）。
 */
export const useDashboardFilterMemory = ({
    dashboardUuid,
    enabled,
}: UseDashboardFilterMemoryArgs) => {
    const stateRef = useRef<FilterMemoryState>(emptyFilterMemoryState());
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dashboardUuidRef = useRef(dashboardUuid);

    // 切换看板时重新载入记忆
    useEffect(() => {
        dashboardUuidRef.current = dashboardUuid;
        stateRef.current = readFilterMemory(dashboardUuid);
    }, [dashboardUuid]);

    const flush = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        if (!enabled) {
            return;
        }
        writeFilterMemory(dashboardUuidRef.current, stateRef.current);
    }, [enabled]);

    const scheduleWrite = useCallback(() => {
        if (!enabled) {
            return;
        }
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null;
            writeFilterMemory(dashboardUuidRef.current, stateRef.current);
        }, WRITE_DEBOUNCE_MS);
    }, [enabled]);

    /**
     * 写入一条用户选择
     */
    const setSelection = useCallback(
        (
            scope: keyof UserFilterSelections,
            identityKey: string,
            entry: FilterMemoryEntry,
        ) => {
            stateRef.current = {
                ...stateRef.current,
                [scope]: {
                    ...stateRef.current[scope],
                    [identityKey]: entry,
                },
                updatedAt: Date.now(),
            };
            scheduleWrite();
        },
        [scheduleWrite],
    );

    /**
     * 删除一条用户选择（例如用户清掉了选择 / 重置了筛选器）
     */
    const removeSelection = useCallback(
        (scope: keyof UserFilterSelections, identityKey: string) => {
            if (!(identityKey in stateRef.current[scope])) {
                return;
            }
            const next = { ...stateRef.current[scope] };
            delete next[identityKey];
            stateRef.current = {
                ...stateRef.current,
                [scope]: next,
                updatedAt: Date.now(),
            };
            scheduleWrite();
        },
        [scheduleWrite],
    );

    /**
     * 清空某个作用域的记忆
     */
    const clearScope = useCallback(
        (scope: keyof UserFilterSelections) => {
            stateRef.current = {
                ...stateRef.current,
                [scope]: {},
                updatedAt: Date.now(),
            };
            scheduleWrite();
        },
        [scheduleWrite],
    );

    const getSelection = useCallback(
        (scope: keyof UserFilterSelections, identityKey: string) =>
            stateRef.current[scope][identityKey],
        [],
    );

    /**
     * 整体替换记忆（例如服务端删除了筛选器，需要剪枝失效条目）
     */
    const replaceState = useCallback(
        (state: FilterMemoryState) => {
            stateRef.current = state;
            scheduleWrite();
        },
        [scheduleWrite],
    );

    // 页面卸载 / 切后台时补一次落盘，避免防抖窗口内的选择丢失
    useEffect(() => {
        const handleFlush = () => flush();
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flush();
            }
        };
        window.addEventListener('pagehide', handleFlush);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.removeEventListener('pagehide', handleFlush);
            document.removeEventListener(
                'visibilitychange',
                handleVisibilityChange,
            );
        };
    }, [flush]);

    // 组件卸载时落盘
    useEffect(() => () => flush(), [flush]);

    const getState = useCallback(() => stateRef.current, []);

    return useMemo(
        () => ({
            /** 当前内存中的记忆状态（不一定已经落盘） */
            getState,
            setSelection,
            removeSelection,
            clearScope,
            getSelection,
            replaceState,
            flush,
        }),
        [
            getState,
            setSelection,
            removeSelection,
            clearScope,
            getSelection,
            replaceState,
            flush,
        ],
    );
};
