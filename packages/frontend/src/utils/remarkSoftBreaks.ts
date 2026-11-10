/**
 * Minimal mdast node shape needed by the soft-break transform.
 *
 * We intentionally avoid importing `mdast`/`unified` types: they are not
 * direct dependencies of the frontend package, so pnpm's isolated node_modules
 * layout would not resolve them.
 */
export type MarkdownNode = {
    type: string;
    value?: string;
    lang?: string;
    children?: MarkdownNode[];
};

const isTextNodeWithNewline = (node: MarkdownNode): boolean =>
    node.type === 'text' && typeof node.value === 'string' && node.value.includes('\n');

/**
 * Splits a text node containing newlines into text nodes separated by
 * mdast `break` nodes (rendered as `<br>` by remark-rehype).
 */
const splitTextNode = (node: MarkdownNode): MarkdownNode[] => {
    const parts = (node.value ?? '').split('\n');
    const result: MarkdownNode[] = [];

    parts.forEach((part, index) => {
        if (index > 0) {
            result.push({ type: 'break' });
        }
        if (part.length > 0) {
            result.push({ type: 'text', value: part });
        }
    });

    return result;
};

const transformNode = (node: MarkdownNode): void => {
    if (!node.children) {
        return;
    }

    const nextChildren: MarkdownNode[] = [];

    node.children.forEach((child) => {
        if (isTextNodeWithNewline(child)) {
            nextChildren.push(...splitTextNode(child));
            return;
        }

        // `code` / `inlineCode` nodes hold their content in `value` and have no
        // children, so they are never modified.
        transformNode(child);
        nextChildren.push(child);
    });

    node.children = nextChildren;
};

/**
 * Remark plugin that turns CommonMark soft line breaks (a single `\n` inside a
 * paragraph) into hard line breaks (`<br>`).
 *
 * Without it, markdown renders "line one\nline two" as a single line, which is
 * surprising for users coming from regular text editors.
 *
 * The plugin must be declared as a `function` (not an arrow function) so that
 * it stays assignable to unified's `Plugin` type, which declares a `this`
 * context.
 */
export function remarkSoftBreaks() {
    return (tree: MarkdownNode): void => {
        transformNode(tree);
    };
}

export default remarkSoftBreaks;
