import { describe, expect, it } from 'vitest';

import { remarkSoftBreaks, type MarkdownNode } from './remarkSoftBreaks';

const transform = (tree: MarkdownNode): MarkdownNode => {
    remarkSoftBreaks()(tree);
    return tree;
};

const paragraph = (value: string): MarkdownNode => ({
    type: 'paragraph',
    children: [{ type: 'text', value }],
});

describe('remarkSoftBreaks', () => {
    it('splits text nodes containing newlines into text/break/text sequences', () => {
        const tree = transform({
            type: 'root',
            children: [paragraph('line one\nline two')],
        });

        expect(tree.children?.[0].children).toEqual([
            { type: 'text', value: 'line one' },
            { type: 'break' },
            { type: 'text', value: 'line two' },
        ]);
    });

    it('handles multiple consecutive newlines', () => {
        const tree = transform({
            type: 'root',
            children: [paragraph('a\n\nb')],
        });

        expect(tree.children?.[0].children).toEqual([
            { type: 'text', value: 'a' },
            { type: 'break' },
            { type: 'break' },
            { type: 'text', value: 'b' },
        ]);
    });

    it('keeps trailing and leading newlines', () => {
        const tree = transform({
            type: 'root',
            children: [paragraph('\na\n')],
        });

        expect(tree.children?.[0].children).toEqual([
            { type: 'break' },
            { type: 'text', value: 'a' },
            { type: 'break' },
        ]);
    });

    it('leaves text nodes without newlines untouched', () => {
        const tree = transform({
            type: 'root',
            children: [paragraph('single line')],
        });

        expect(tree.children?.[0].children).toEqual([
            { type: 'text', value: 'single line' },
        ]);
    });

    it('does not modify code blocks or inline code', () => {
        const tree = transform({
            type: 'root',
            children: [
                {
                    type: 'code',
                    value: 'const a = 1;\nconst b = 2;',
                    lang: 'ts',
                },
                {
                    type: 'paragraph',
                    children: [
                        { type: 'inlineCode', value: 'a\nb' },
                        { type: 'text', value: ' and ' },
                        { type: 'text', value: 'text\nwith break' },
                    ],
                },
            ],
        });

        expect(tree.children?.[0]).toEqual({
            type: 'code',
            value: 'const a = 1;\nconst b = 2;',
            lang: 'ts',
        });
        expect(tree.children?.[1].children).toEqual([
            { type: 'inlineCode', value: 'a\nb' },
            { type: 'text', value: ' and ' },
            { type: 'text', value: 'text' },
            { type: 'break' },
            { type: 'text', value: 'with break' },
        ]);
    });

    it('transforms nested children', () => {
        const tree = transform({
            type: 'root',
            children: [
                {
                    type: 'blockquote',
                    children: [paragraph('quoted\ntext')],
                },
            ],
        });

        expect(tree.children?.[0].children?.[0].children).toEqual([
            { type: 'text', value: 'quoted' },
            { type: 'break' },
            { type: 'text', value: 'text' },
        ]);
    });
});
