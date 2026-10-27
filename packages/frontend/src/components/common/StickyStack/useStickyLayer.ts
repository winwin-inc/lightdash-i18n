import {
    useCallback,
    useMemo,
    useRef,
    type CSSProperties,
    type RefCallback,
} from 'react';
import { useStickyStackContext } from './StickyStackContext';

/**
 * Base z-index for sticky layers.
 *
 * It needs to be above the dashboard tile loading overlay
 * (`getDefaultZIndex('modal') - 10` = 190) so tiles never paint over the
 * sticky bar, but below Mantine's modal (200), popover (300) and
 * overlay (400) so dropdowns and dialogs still open on top of it.
 */
export const STICKY_Z_INDEX_BASE = 195;

type UseStickyLayerProps = {
    /** Unique id of the layer */
    id: string;
    /** Position of the layer in the stack. 0 is the topmost layer */
    order: number;
    /** When false the element is not sticky and is not part of the stack */
    enabled?: boolean;
};

/**
 * Makes an element stick to the top of the scroll container, below the layers
 * that are registered with a lower `order`.
 *
 * The returned `ref` must be attached to the element and the returned `style`
 * must be applied to it.
 *
 * A callback ref is used (instead of a ref object) so that layers that are
 * rendered conditionally are registered as soon as they appear, and
 * unregistered when they are removed.
 */
export const useStickyLayer = ({
    id,
    order,
    enabled = true,
}: UseStickyLayerProps): {
    ref: RefCallback<HTMLDivElement>;
    style: CSSProperties;
} => {
    const { registerLayer, unregisterLayer, getLayerOffset } =
        useStickyStackContext();
    const observerRef = useRef<ResizeObserver | null>(null);

    const ref = useCallback<RefCallback<HTMLDivElement>>(
        (element) => {
            observerRef.current?.disconnect();
            observerRef.current = null;
            unregisterLayer(id);

            if (!enabled || !element) {
                return;
            }

            const updateHeight = () => {
                registerLayer(
                    id,
                    order,
                    element.getBoundingClientRect().height,
                );
            };

            updateHeight();

            const observer = new ResizeObserver(updateHeight);
            observer.observe(element);
            observerRef.current = observer;
        },
        [enabled, id, order, registerLayer, unregisterLayer],
    );

    const offset = getLayerOffset(id);

    const style = useMemo<CSSProperties>(
        () =>
            enabled
                ? {
                      position: 'sticky',
                      top: offset,
                      // Layers closer to the top of the scroll container are painted on top
                      zIndex: STICKY_Z_INDEX_BASE - order,
                  }
                : {},
        [enabled, offset, order],
    );

    return { ref, style };
};
