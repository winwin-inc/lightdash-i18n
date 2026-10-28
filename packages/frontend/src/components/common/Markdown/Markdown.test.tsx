/* eslint-disable testing-library/no-container */
/* eslint-disable testing-library/no-node-access */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type * as MarkdownPreviewModule from '@uiw/react-markdown-preview';
import { Markdown } from './Markdown';

// The global test setup mocks `@uiw/react-markdown-preview`, so we restore the
// real implementation to assert on the rendered HTML.
vi.mock('@uiw/react-markdown-preview', async (importOriginal) => {
    const actual = await importOriginal<
        typeof MarkdownPreviewModule
    >();
    return actual;
});

describe('Markdown', () => {
    it('renders a single newline as a line break by default', () => {
        const { container } = render(<Markdown source={'line one\nline two'} />);

        const paragraph = container.querySelector('p');
        expect(paragraph?.querySelector('br')).not.toBeNull();
        expect(paragraph).toHaveTextContent('line one');
        expect(paragraph).toHaveTextContent('line two');
    });

    it('keeps the CommonMark behaviour when softBreaks is disabled', () => {
        const { container } = render(
            <Markdown source={'line one\nline two'} softBreaks={false} />,
        );

        const paragraph = container.querySelector('p');
        expect(paragraph?.querySelector('br')).toBeNull();
        // CommonMark keeps the raw newline in the text node, the browser
        // collapses it when rendering.
        expect(paragraph?.textContent).toBe('line one\nline two');
    });

    it('keeps paragraph breaks working', () => {
        const { container } = render(
            <Markdown source={'first paragraph\n\nsecond paragraph'} />,
        );

        const paragraphs = container.querySelectorAll('p');
        expect(paragraphs).toHaveLength(2);
        expect(paragraphs[0]).toHaveTextContent('first paragraph');
        expect(paragraphs[1]).toHaveTextContent('second paragraph');
    });

    it('does not add line breaks inside code blocks', () => {
        const { container } = render(
            <Markdown source={'```\nconst a = 1;\nconst b = 2;\n```'} />,
        );

        const code = container.querySelector('code');
        expect(code?.querySelector('br')).toBeNull();
        expect(code).toHaveTextContent('const a = 1;');
    });

    it('does not duplicate an existing hard line break', () => {
        const { container } = render(<Markdown source={'a  \nb'} />);

        const paragraph = container.querySelector('p');
        expect(paragraph?.querySelectorAll('br')).toHaveLength(1);
    });

    it('still renders lists', () => {
        const { container } = render(<Markdown source={'- first\n- second'} />);

        const items = container.querySelectorAll('li');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('first');
        expect(items[1]).toHaveTextContent('second');
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
});
