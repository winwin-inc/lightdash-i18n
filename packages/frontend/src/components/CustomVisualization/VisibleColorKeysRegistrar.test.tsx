import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VisibleColorKeysRegistrar from './VisibleColorKeysRegistrar';

describe('VisibleColorKeysRegistrar', () => {
    it('does not register when disabled', () => {
        const register = vi.fn();
        render(
            <VisibleColorKeysRegistrar
                enabled={false}
                keys={['a', 'b']}
                registerVisibleColorKeys={register}
            />,
        );
        expect(register).not.toHaveBeenCalled();
    });

    it('does not register when keys are empty', () => {
        const register = vi.fn();
        render(
            <VisibleColorKeysRegistrar
                enabled
                keys={[]}
                registerVisibleColorKeys={register}
            />,
        );
        expect(register).not.toHaveBeenCalled();
    });

    it('registers the visible keys', () => {
        const register = vi.fn();
        render(
            <VisibleColorKeysRegistrar
                enabled
                keys={['a', 'b']}
                registerVisibleColorKeys={register}
            />,
        );
        expect(register).toHaveBeenCalledTimes(1);
        expect(register).toHaveBeenCalledWith(['a', 'b']);
    });

    it('does not register again when re-rendered with the same register fn and same keys', () => {
        const register = vi.fn();
        const { rerender } = render(
            <VisibleColorKeysRegistrar
                enabled
                keys={['a', 'b']}
                registerVisibleColorKeys={register}
            />,
        );
        // new array instance with identical content
        rerender(
            <VisibleColorKeysRegistrar
                enabled
                keys={['a', 'b']}
                registerVisibleColorKeys={register}
            />,
        );
        expect(register).toHaveBeenCalledTimes(1);
    });

    it('registers again when the register fn identity changes (dashboard color table reset)', () => {
        const register1 = vi.fn();
        const register2 = vi.fn();
        const { rerender } = render(
            <VisibleColorKeysRegistrar
                enabled
                keys={['a', 'b']}
                registerVisibleColorKeys={register1}
            />,
        );
        expect(register1).toHaveBeenCalledTimes(1);

        rerender(
            <VisibleColorKeysRegistrar
                enabled
                keys={['a', 'b']}
                registerVisibleColorKeys={register2}
            />,
        );
        expect(register2).toHaveBeenCalledTimes(1);
        expect(register2).toHaveBeenCalledWith(['a', 'b']);
    });

    it('registers again when the keys change', () => {
        const register = vi.fn();
        const { rerender } = render(
            <VisibleColorKeysRegistrar
                enabled
                keys={['a']}
                registerVisibleColorKeys={register}
            />,
        );
        expect(register).toHaveBeenCalledTimes(1);

        rerender(
            <VisibleColorKeysRegistrar
                enabled
                keys={['a', 'b']}
                registerVisibleColorKeys={register}
            />,
        );
        expect(register).toHaveBeenCalledTimes(2);
        expect(register).toHaveBeenLastCalledWith(['a', 'b']);
    });
});
