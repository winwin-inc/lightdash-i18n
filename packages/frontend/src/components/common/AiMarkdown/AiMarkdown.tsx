// STUB: full Streamdown AiMarkdown not ported — render children as plain text.
import { Box, Text } from '@mantine-8/core';
import { type FC, type ReactNode } from 'react';

type AiMarkdownProps = {
    children: string;
    isStreaming?: boolean;
    className?: string;
    remarkPlugins?: unknown[];
    rehypePlugins?: unknown[];
    plugins?: unknown;
    components?: Record<string, unknown>;
    allowedTags?: unknown;
};

export const AiMarkdown: FC<AiMarkdownProps> = ({
    children,
    className,
}) => (
    <Box className={className}>
        <Text
            size="sm"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
            {children as ReactNode}
        </Text>
    </Box>
);
