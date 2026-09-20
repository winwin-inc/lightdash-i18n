// STUB: Phase C — minimal ReasoningHistoryRow for AppVersionNarration.
import { Box, Text } from '@mantine-8/core';
import { type Icon as TablerIconType } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';

export const ReasoningHistoryRow: FC<{
    texts: string[];
    isLive: boolean;
    icon?: TablerIconType;
    label?: string;
}> = ({ texts, isLive, icon, label = 'Reasoning' }) => {
    if (texts.length === 0) return null;
    return (
        <Box>
            <Text size="xs" c="dimmed" fw={500}>
                {icon ? <MantineIcon icon={icon} size={12} /> : null} {label}
                {isLive ? '…' : ''}
            </Text>
            {texts.map((text, i) => (
                <Text key={i} size="xs" c="ldGray.7">
                    {text}
                </Text>
            ))}
        </Box>
    );
};

// STUB: Phase C
export const LiveActivityCard: FC<Record<string, unknown>> = () => null;
