import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useObservedContainerSize } from './useObservedContainerSize';

type ResizeObserverCallback = (
    entries: ResizeObserverEntry[],
    observer: ResizeObserver,
) => void;

describe('useObservedContainerSize', () => {
    let observerCallback: ResizeObserverCallback | null = null;
    let observedElements: Element[] = [];
    let disconnectMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        observerCallback = null;
        observedElements = [];
        disconnectMock = vi.fn();

        class ResizeObserverMock {
            constructor(callback: ResizeObserverCallback) {
                observerCallback = callback;
            }

            observe(el: Element) {
                observedElements.push(el);
            }

            disconnect() {
                disconnectMock();
            }

            unobserve() {}
        }

        vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const mockElement = (width: number, height: number): HTMLDivElement => {
        const el = document.createElement('div');
        el.getBoundingClientRect = () =>
            ({
                width,
                height,
                top: 0,
                left: 0,
                bottom: height,
                right: width,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect);
        return el;
    };

    it('observes on callback-ref attach and reports immediate positive size', () => {
        const { result } = renderHook(() => useObservedContainerSize());
        const el = mockElement(320, 180);

        act(() => {
            result.current.measureRef(el);
        });

        expect(observedElements).toEqual([el]);
        expect(result.current.size).toEqual({ width: 320, height: 180 });
    });

    it('reports sub-min positive sizes (stable gate is callers job)', () => {
        const { result } = renderHook(() => useObservedContainerSize());
        const el = mockElement(40, 40);

        act(() => {
            result.current.measureRef(el);
        });

        expect(result.current.size).toEqual({ width: 40, height: 40 });
    });

    it('ignores zero or negative sizes', () => {
        const { result } = renderHook(() => useObservedContainerSize());
        const el = mockElement(0, 100);

        act(() => {
            result.current.measureRef(el);
        });

        expect(result.current.size).toEqual({ width: 0, height: 0 });
    });

    it('updates size when ResizeObserver fires', () => {
        const { result } = renderHook(() => useObservedContainerSize());
        const el = mockElement(200, 120);

        act(() => {
            result.current.measureRef(el);
        });

        el.getBoundingClientRect = () =>
            ({
                width: 400,
                height: 240,
                top: 0,
                left: 0,
                bottom: 240,
                right: 400,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect);

        act(() => {
            observerCallback?.([], {} as ResizeObserver);
        });

        expect(result.current.size).toEqual({ width: 400, height: 240 });
    });

    it('disconnects previous observer when ref is cleared or replaced', () => {
        const { result } = renderHook(() => useObservedContainerSize());
        const first = mockElement(200, 120);
        const second = mockElement(300, 160);

        act(() => {
            result.current.measureRef(first);
        });
        expect(disconnectMock).not.toHaveBeenCalled();

        act(() => {
            result.current.measureRef(second);
        });
        expect(disconnectMock).toHaveBeenCalledTimes(1);
        expect(observedElements).toEqual([first, second]);
        expect(result.current.size).toEqual({ width: 300, height: 160 });

        act(() => {
            result.current.measureRef(null);
        });
        expect(disconnectMock).toHaveBeenCalledTimes(2);
    });

    it('retries measure on rAF when first read is zero', () => {
        vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });

        const { result } = renderHook(() => useObservedContainerSize());
        const el = mockElement(0, 0);
        let reads = 0;
        el.getBoundingClientRect = () => {
            reads += 1;
            const ready = reads > 1;
            const width = ready ? 320 : 0;
            const height = ready ? 48 : 0;
            return {
                width,
                height,
                top: 0,
                left: 0,
                bottom: height,
                right: width,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect;
        };

        act(() => {
            result.current.measureRef(el);
        });
        expect(result.current.size).toEqual({ width: 0, height: 0 });

        act(() => {
            vi.runAllTimers();
        });
        expect(result.current.size).toEqual({ width: 320, height: 48 });

        vi.useRealTimers();
    });
});
