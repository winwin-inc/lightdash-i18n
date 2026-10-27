import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StickyStackProvider from './StickyStackProvider';
import { useStickyLayer } from './useStickyLayer';

const LAYER_HEIGHTS: Record<string, number> = {
    'layer-0': 40,
    'layer-1': 30,
    'layer-2': 20,
};

const Layer: React.FC<{ id: string; order: number; enabled?: boolean }> = ({
    id,
    order,
    enabled = true,
}) => {
    const { ref, style } = useStickyLayer({ id, order, enabled });
    return <div data-testid={id} ref={ref} style={style} />;
};

describe('StickyStack', () => {
    beforeEach(() => {
        vi.spyOn(
            HTMLElement.prototype,
            'getBoundingClientRect',
        ).mockImplementation(function getRect(this: HTMLElement) {
            const id = this.getAttribute('data-testid');
            const height = (id && LAYER_HEIGHTS[id]) || 0;
            return {
                width: 100,
                height,
                top: 0,
                left: 0,
                right: 100,
                bottom: height,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            } as DOMRect;
        });
    });

    it('stacks the layers below each other', () => {
        render(
            <StickyStackProvider>
                <Layer id="layer-0" order={0} />
                <Layer id="layer-1" order={1} />
                <Layer id="layer-2" order={2} />
            </StickyStackProvider>,
        );

        expect(screen.getByTestId('layer-0')).toHaveStyle({
            position: 'sticky',
            top: '0px',
        });
        // 40px (layer-0) + 0px (nothing above layer-1)
        expect(screen.getByTestId('layer-1')).toHaveStyle({ top: '40px' });
        // 40px (layer-0) + 30px (layer-1)
        expect(screen.getByTestId('layer-2')).toHaveStyle({ top: '70px' });
    });

    it('paints the topmost layer on top', () => {
        render(
            <StickyStackProvider>
                <Layer id="layer-0" order={0} />
                <Layer id="layer-1" order={1} />
            </StickyStackProvider>,
        );

        expect(screen.getByTestId('layer-0')).toHaveStyle({ zIndex: '100' });
        expect(screen.getByTestId('layer-1')).toHaveStyle({ zIndex: '99' });
    });

    it('does not make disabled layers sticky', () => {
        render(
            <StickyStackProvider>
                <Layer id="layer-0" order={0} enabled={false} />
                <Layer id="layer-1" order={1} />
            </StickyStackProvider>,
        );

        expect(screen.getByTestId('layer-0')).not.toHaveStyle({
            position: 'sticky',
        });
        // disabled layers are not part of the stack
        expect(screen.getByTestId('layer-1')).toHaveStyle({ top: '0px' });
    });
});
