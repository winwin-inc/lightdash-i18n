import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import MantineProvider from '../../providers/MantineProvider';
import { ValueOrderEditor, type ValueOrderEditorProps } from './ValueOrderEditor';

const defaultProps: ValueOrderEditorProps = {
    values: ['A', 'B'],
    candidateValues: ['A', 'B', 'C'],
    isCandidatesLoading: false,
    candidatesError: undefined,
    onSearchChange: vi.fn(),
    onChange: vi.fn(),
};

const renderEditor = (props: ValueOrderEditorProps) =>
    render(
        <MantineProvider>
            <ValueOrderEditor {...props} />
        </MantineProvider>,
    );

const getRow = (value: string): HTMLElement => {
    const row = screen
        .getAllByTestId('value-order-item')
        .find((item) => item.getAttribute('data-value') === value);

    if (!row) {
        throw new Error(`No selected value row found for "${value}"`);
    }

    return row;
};

describe('ValueOrderEditor', () => {
    it('appends a candidate value to the selected values', async () => {
        const onChange = vi.fn();
        renderEditor({ ...defaultProps, onChange });

        // only the values that are not selected yet are proposed
        const candidates = screen.getAllByTestId('value-order-candidate');
        expect(candidates).toHaveLength(1);
        expect(candidates[0]).toHaveAttribute('data-value', 'C');

        await userEvent.click(candidates[0]);

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(['A', 'B', 'C']);
    });

    it('removes a selected value', async () => {
        const onChange = vi.fn();
        renderEditor({ ...defaultProps, onChange });

        await userEvent.click(
            within(getRow('B')).getByLabelText('Remove value'),
        );

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(['A']);
    });

    it('moves a selected value up', async () => {
        const onChange = vi.fn();
        renderEditor({ ...defaultProps, onChange });

        await userEvent.click(within(getRow('B')).getByLabelText('Move up'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(['B', 'A']);
    });

    it('moves a selected value down', async () => {
        const onChange = vi.fn();
        renderEditor({ ...defaultProps, onChange });

        await userEvent.click(within(getRow('A')).getByLabelText('Move down'));

        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith(['B', 'A']);
    });

    it('flags the selected values that are not in the candidate list', () => {
        renderEditor({ ...defaultProps, values: ['A', 'Missing'] });

        expect(getRow('A')).toHaveAttribute('data-missing', 'false');
        expect(getRow('Missing')).toHaveAttribute('data-missing', 'true');

        // the missing value is greyed out
        expect(getRow('Missing')).toHaveStyle({ opacity: '0.55' });
        expect(getRow('A')).not.toHaveStyle({ opacity: '0.55' });
    });

    it('keeps the missing values and explains them with a tooltip', async () => {
        renderEditor({ ...defaultProps, values: ['A', 'Missing'] });

        // the missing value is not removed
        expect(screen.getAllByTestId('value-order-item')).toHaveLength(2);

        await userEvent.hover(within(getRow('Missing')).getByText('Missing'));

        expect(await screen.findByRole('tooltip')).toHaveTextContent(
            'Not found in current data',
        );
    });

    it('calls onSearchChange once the search is debounced', () => {
        vi.useFakeTimers();

        try {
            const onSearchChange = vi.fn();
            renderEditor({ ...defaultProps, onSearchChange });

            const input = screen.getByPlaceholderText(
                'Search values from the database',
            );
            fireEvent.change(input, { target: { value: 'ab' } });

            // the search is debounced, nothing is emitted yet
            expect(onSearchChange).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(300);
            });

            expect(onSearchChange).toHaveBeenCalledTimes(1);
            expect(onSearchChange).toHaveBeenCalledWith('ab');
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not search on mount, the parent owns the first load', () => {
        vi.useFakeTimers();

        try {
            const onSearchChange = vi.fn();
            renderEditor({ ...defaultProps, onSearchChange });

            act(() => {
                vi.advanceTimersByTime(300);
            });

            expect(onSearchChange).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows a message when there is no candidate value', () => {
        renderEditor({ ...defaultProps, candidateValues: ['A', 'B'] });

        expect(
            screen.getByText('No values found'),
        ).toBeInTheDocument();
    });

    it('shows the candidates error', () => {
        renderEditor({
            ...defaultProps,
            candidateValues: [],
            candidatesError: 'Something went wrong',
        });

        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
});
