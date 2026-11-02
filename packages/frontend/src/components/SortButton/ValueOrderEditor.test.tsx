import { MAX_VALUE_ORDER_ITEMS } from '@lightdash/common';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import MantineProvider from '../../providers/MantineProvider';
import {
    ValueOrderEditor,
    type ValueOrderEditorProps,
} from './ValueOrderEditor';

const defaultProps: ValueOrderEditorProps = {
    values: ['A', 'B'],
    candidateValues: ['A', 'B', 'C'],
    isCandidatesLoading: false,
    candidatesError: undefined,
    onSearchChange: vi.fn(),
    onChange: vi.fn(),
};

const renderEditor = (props: Partial<ValueOrderEditorProps> = {}) =>
    render(
        <MantineProvider>
            <ValueOrderEditor {...defaultProps} {...props} />
        </MantineProvider>,
    );

const getSearchInput = () => screen.getByRole('searchbox');

describe('ValueOrderEditor（单行多选）', () => {
    it('renders the selected values as tags, in order', () => {
        renderEditor();

        const first = screen.getByText('A');
        const second = screen.getByText('B');

        expect(
            first.compareDocumentPosition(second) &
                Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeGreaterThan(0);
    });

    it('appends a candidate picked from the dropdown', async () => {
        const onChange = vi.fn();
        renderEditor({ onChange });
        const user = userEvent.setup({ pointerEventsCheck: 0 });

        await user.click(getSearchInput());
        await user.click(screen.getByRole('option', { name: 'C' }));

        expect(onChange).toHaveBeenCalledWith(['A', 'B', 'C']);
    });

    it('removes a value when its tag is removed', async () => {
        const onChange = vi.fn();
        renderEditor({ onChange });

        const removeButtons = screen.getAllByRole('button', { hidden: true });
        const user = userEvent.setup({ pointerEventsCheck: 0 });
        await user.click(removeButtons[0]);

        expect(onChange).toHaveBeenCalledWith(['B']);
    });

    it('does not offer empty or whitespace only candidates', async () => {
        renderEditor({ candidateValues: ['A', '', '   ', 'C'] });
        const user = userEvent.setup({ pointerEventsCheck: 0 });

        await user.click(getSearchInput());

        expect(
            screen.queryByRole('option', { name: '   ' }),
        ).not.toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'C' })).toBeInTheDocument();
    });

    it('debounces the search term before asking the parent', async () => {
        vi.useFakeTimers();
        const onSearchChange = vi.fn();
        renderEditor({ onSearchChange });
        const user = userEvent.setup({
            pointerEventsCheck: 0,
            advanceTimers: vi.advanceTimersByTime,
        });

        await user.type(getSearchInput(), 'ab');
        expect(onSearchChange).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(300);
        });

        expect(onSearchChange).toHaveBeenCalledWith('ab');
        vi.useRealTimers();
    });

    it('shows the candidates error', () => {
        renderEditor({ candidatesError: 'Something went wrong' });

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('shares the max values limit with the backend', () => {
        expect(MAX_VALUE_ORDER_ITEMS).toBe(200);
    });
});
