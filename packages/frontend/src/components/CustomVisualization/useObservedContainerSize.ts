import { useCallback, useEffect, useRef, useState } from 'react';
import { type ChartSize } from './useStableChartSize';

/**
 * Observe a container's pixel size via ResizeObserver attached in the
 * callback ref (mount-time), so the observer is never stuck waiting for a
 * re-render that assigns Mantine's `ref.current`.
 *
 * Any positive size is reported; callers gate mount with useStableChartSize.
 */
export function useObservedContainerSize(): {
    measureRef: (el: HTMLDivElement | null) => void;
    size: ChartSize;
} {
    const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 });
    const observerRef = useRef<ResizeObserver | null>(null);
    const rafIdRef = useRef<number | null>(null);

    const applySize = useCallback((width: number, height: number) => {
        if (width <= 0 || height <= 0) {
            return;
        }
        setSize((prev) => {
            if (prev.width === width && prev.height === height) {
                return prev;
            }
            return { width, height };
        });
    }, []);

    const measureRef = useCallback(
        (el: HTMLDivElement | null) => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
            if (observerRef.current) {
                observerRef.current.disconnect();
                observerRef.current = null;
            }
            if (!el) {
                return;
            }

            const readAndApply = () => {
                const rect = el.getBoundingClientRect();
                applySize(rect.width, rect.height);
                return rect.width > 0 && rect.height > 0;
            };

            const observer = new ResizeObserver(() => {
                readAndApply();
            });
            observer.observe(el);
            observerRef.current = observer;

            // Immediate read; if layout is not ready yet, retry once on rAF.
            if (!readAndApply()) {
                rafIdRef.current = requestAnimationFrame(() => {
                    rafIdRef.current = null;
                    readAndApply();
                });
            }
        },
        [applySize],
    );

    useEffect(() => {
        return () => {
            if (rafIdRef.current !== null) {
                cancelAnimationFrame(rafIdRef.current);
                rafIdRef.current = null;
            }
            observerRef.current?.disconnect();
            observerRef.current = null;
        };
    }, []);

    return { measureRef, size };
}
