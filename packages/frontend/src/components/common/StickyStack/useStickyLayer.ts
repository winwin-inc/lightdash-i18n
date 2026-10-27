import {
    useLayoutEffect,
    useMemo,
    useRef,
    type CSSProperties,
    type RefObject,
} from 'react';
import { useStickyStackContext } from './StickyStackContext';

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
 */
export const useStickyLayer = ({
    id,
    order,
    enabled = true,
}: UseStickyLayerProps): {
    ref: RefObject<HTMLDivElement | null>;
    style: CSSProperties;
} => {
    const { registerLayer, unregisterLayer, getLayerOffset } =
        useStickyStackContext();
    const ref = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const element = ref.current;
        if (!enabled || !element) {
            unregisterLayer(id);
            return undefined;
        }

        const updateHeight = () => {
            registerLayer(id, order, element.getBoundingClientRect().height);
        };

        updateHeight();

        const observer = new ResizeObserver(updateHeight);
        observer.observe(element);

        return () => {
            observer.disconnect();
            unregisterLayer(id);
        };
    }, [enabled, id, order, registerLayer, unregisterLayer]);

    const offset = getLayerOffset(id);

    const style = useMemo<CSSProperties>(
        () =>
            enabled
                ? {
                      position: 'sticky',
                      top: offset,
                      // Layers closer to the top of the scroll container are painted on top
                      zIndex: 100 - order,
                  }
                : {},
        [enabled, offset, order],
    );

    return { ref, style };
};
