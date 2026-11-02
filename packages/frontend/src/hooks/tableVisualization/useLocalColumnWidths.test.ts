import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from './columnWidth';
import { useLocalColumnWidths } from './useLocalColumnWidths';

const STORAGE_KEY = 'ld:table-col-width:v1:chart-uuid';

describe('useLocalColumnWidths', () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it('starts empty when nothing is stored', () => {
        const { result } = renderHook(() => useLocalColumnWidths('chart-uuid'));
        expect(result.current.localColumnWidths).toEqual({});
    });

    it('persists dragged widths per chart', () => {
        const { result } = renderHook(() => useLocalColumnWidths('chart-uuid'));

        act(() => result.current.setLocalColumnWidth('orders_total', 220));

        expect(result.current.localColumnWidths).toEqual({
            orders_total: 220,
        });
        expect(
            JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}'),
        ).toEqual({ orders_total: 220 });

        // A fresh mount (page refresh) reads the persisted value back.
        const { result: remounted } = renderHook(() =>
            useLocalColumnWidths('chart-uuid'),
        );
        expect(remounted.current.localColumnWidths).toEqual({
            orders_total: 220,
        });
    });

    it('clamps stored widths to the supported range', () => {
        const { result } = renderHook(() => useLocalColumnWidths('chart-uuid'));

        act(() => result.current.setLocalColumnWidth('a', 1));
        act(() => result.current.setLocalColumnWidth('b', 99999));

        expect(result.current.localColumnWidths).toEqual({
            a: MIN_COLUMN_WIDTH,
            b: MAX_COLUMN_WIDTH,
        });
    });

    it('removes a width on reset and cleans up empty storage', () => {
        const { result } = renderHook(() => useLocalColumnWidths('chart-uuid'));

        act(() => result.current.setLocalColumnWidth('orders_total', 220));
        act(() => result.current.setLocalColumnWidth('orders_total', null));

        expect(result.current.localColumnWidths).toEqual({});
        expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('keeps widths in memory when the chart has no uuid', () => {
        const { result } = renderHook(() => useLocalColumnWidths(undefined));

        act(() => result.current.setLocalColumnWidth('orders_total', 220));

        expect(result.current.localColumnWidths).toEqual({
            orders_total: 220,
        });
        expect(window.localStorage.length).toBe(0);
    });

    it('ignores corrupted or invalid stored payloads', () => {
        window.localStorage.setItem(STORAGE_KEY, 'not-json');
        const { result: broken } = renderHook(() =>
            useLocalColumnWidths('chart-uuid'),
        );
        expect(broken.current.localColumnWidths).toEqual({});

        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ good: 180, tooSmall: 10, text: 'wide' }),
        );
        const { result: partial } = renderHook(() =>
            useLocalColumnWidths('chart-uuid'),
        );
        expect(partial.current.localColumnWidths).toEqual({ good: 180 });
    });

    it('isolates widths per dashboard tile and falls back to chart scope', () => {
        // 图表页（无 tile）写入图表级 key
        const { result: chartScope } = renderHook(() =>
            useLocalColumnWidths('chart-uuid'),
        );
        act(() => chartScope.current.setLocalColumnWidth('a', 200));

        // 看板 tile 是独立命名空间：看不到图表级宽度，也不会互相污染
        const { result: tileA } = renderHook(() =>
            useLocalColumnWidths('chart-uuid', 'tile-a'),
        );
        expect(tileA.current.localColumnWidths).toEqual({});
        act(() => tileA.current.setLocalColumnWidth('a', 300));

        const { result: tileB } = renderHook(() =>
            useLocalColumnWidths('chart-uuid', 'tile-b'),
        );
        expect(tileB.current.localColumnWidths).toEqual({});

        // 再次进入 tile A（刷新）仍有自己的宽度
        const { result: tileAAgain } = renderHook(() =>
            useLocalColumnWidths('chart-uuid', 'tile-a'),
        );
        expect(tileAAgain.current.localColumnWidths).toEqual({ a: 300 });

        // 图表级宽度未被 tile 修改
        expect(chartScope.current.localColumnWidths).toEqual({ a: 200 });
    });

    it('reloads widths when the chart changes in the same component', () => {
        window.localStorage.setItem(
            'ld:table-col-width:v1:other-chart',
            JSON.stringify({ orders_total: 300 }),
        );

        const { result, rerender } = renderHook(
            ({ uuid }: { uuid: string }) => useLocalColumnWidths(uuid),
            { initialProps: { uuid: 'chart-uuid' } },
        );
        act(() => result.current.setLocalColumnWidth('orders_total', 220));

        rerender({ uuid: 'other-chart' });

        expect(result.current.localColumnWidths).toEqual({
            orders_total: 300,
        });
    });
});
