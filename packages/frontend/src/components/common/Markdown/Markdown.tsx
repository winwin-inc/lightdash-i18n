import MarkdownPreview from '@uiw/react-markdown-preview';
import { type ComponentProps, type FC, useMemo } from 'react';

import { remarkSoftBreaks } from '../../../utils/remarkSoftBreaks';

type MarkdownProps = ComponentProps<typeof MarkdownPreview> & {
    /**
     * Whether a single newline inside a paragraph is rendered as a line break.
     * Defaults to `true` (GitHub-like behaviour). Set to `false` to keep the
     * CommonMark behaviour, where a single newline is collapsed into a space.
     */
    softBreaks?: boolean;
};

/**
 * Shared markdown renderer.
 *
 * It wraps `@uiw/react-markdown-preview` and enables soft line breaks by
 * default, so that pressing Enter in an editor results in a visible line
 * break instead of the text being squeezed onto a single line.
 */
export const Markdown: FC<MarkdownProps> = ({
    softBreaks = true,
    remarkPlugins,
    ...rest
}) => {
    const plugins = useMemo(
        () =>
            softBreaks
                ? [remarkSoftBreaks, ...(remarkPlugins ?? [])]
                : remarkPlugins,
        [softBreaks, remarkPlugins],
    );

    return <MarkdownPreview remarkPlugins={plugins} {...rest} />;
};

export default Markdown;
