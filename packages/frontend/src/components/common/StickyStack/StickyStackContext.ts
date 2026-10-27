import { createContext, useContext } from 'react';

export type StickyLayer = {
    id: string;
    order: number;
    height: number;
};

export type StickyStackContextValue = {
    /** Register (or update) the measured height of a layer */
    registerLayer: (id: string, order: number, height: number) => void;
    /** Remove a layer from the stack */
    unregisterLayer: (id: string) => void;
    /** Offset (in px) from the top of the scroll container where the layer sticks */
    getLayerOffset: (id: string) => number;
};

export const StickyStackContext = createContext<StickyStackContextValue | null>(
    null,
);

export const useStickyStackContext = () => {
    const context = useContext(StickyStackContext);
    if (!context) {
        throw new Error(
            'useStickyLayer must be used within a StickyStackProvider',
        );
    }
    return context;
};
