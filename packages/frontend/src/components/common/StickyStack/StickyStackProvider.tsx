import { useCallback, useMemo, useState, type FC, type ReactNode } from 'react';
import {
    StickyStackContext,
    type StickyLayer,
    type StickyStackContextValue,
} from './StickyStackContext';

/**
 * Sticky stack
 *
 * Allows several elements (that live in the same scroll container) to stick to
 * the top of that container, one below the other.
 *
 * Every layer declares an `order` (0 = closest to the top of the scroll
 * container). The height of each layer is measured so that the `top` offset of
 * a layer is always the sum of the heights of the layers above it. This keeps
 * the stack correct when filters wrap to a new line or when the tab bar
 * changes size.
 */
const StickyStackProvider: FC<{ children: ReactNode }> = ({ children }) => {
    const [layers, setLayers] = useState<Record<string, StickyLayer>>({});

    const registerLayer = useCallback(
        (id: string, order: number, height: number) => {
            setLayers((prev) => {
                const current = prev[id];
                if (
                    current &&
                    current.order === order &&
                    Math.abs(current.height - height) < 0.5
                ) {
                    return prev;
                }
                return { ...prev, [id]: { id, order, height } };
            });
        },
        [],
    );

    const unregisterLayer = useCallback((id: string) => {
        setLayers((prev) => {
            if (!(id in prev)) return prev;
            const next = { ...prev };
            delete next[id];
            return next;
        });
    }, []);

    const getLayerOffset = useCallback(
        (id: string) => {
            const layer = layers[id];
            if (!layer) return 0;
            return (
                Object.values(layers)
                    .filter((l) => l.order < layer.order)
                    // Empty layers must not take up any space in the stack,
                    // otherwise they leave a gap where content scrolls through
                    .filter((l) => l.height > 0)
                    .reduce((total, l) => total + l.height, 0)
            );
        },
        [layers],
    );

    const value = useMemo<StickyStackContextValue>(
        () => ({ registerLayer, unregisterLayer, getLayerOffset }),
        [registerLayer, unregisterLayer, getLayerOffset],
    );

    return (
        <StickyStackContext.Provider value={value}>
            {children}
        </StickyStackContext.Provider>
    );
};

export default StickyStackProvider;
