import { Badge, Group, rem, Stack, Text } from '@mantine-8/core';
import { useTranslation } from 'react-i18next';

export const AiChartGenerationToolCallDescription = ({
    title,
    dimensions,
    metrics,
    breakdownByDimension,
}: {
    title: string;
    dimensions: string[];
    metrics: string[];
    breakdownByDimension?: string | null;
}) => {
    const { t } = useTranslation();

    const fields = [...dimensions, ...metrics];

    return (
        <Stack gap="xs">
            <Group gap="xs">
                <Text c="dimmed" size="xs">
                    {t('ai_copilot_chat_elements_tool_calls.generated_chart')}{' '}
                    <Badge
                        mx={rem(2)}
                        color="gray"
                        variant="light"
                        size="xs"
                        radius="sm"
                        style={{
                            textTransform: 'none',
                            fontWeight: 400,
                        }}
                    >
                        {title}
                    </Badge>{' '}
                    {fields.length > 0 && (
                        <>
                            {t(
                                'ai_copilot_chat_elements_tool_calls.with_fields',
                            )}{' '}
                            {fields.map((field) => (
                                <Badge
                                    key={field}
                                    mx={rem(2)}
                                    color="gray"
                                    variant="light"
                                    size="xs"
                                    radius="sm"
                                    style={{
                                        textTransform: 'none',
                                        fontWeight: 400,
                                    }}
                                >
                                    {field}
                                </Badge>
                            ))}
                        </>
                    )}
                    {breakdownByDimension && (
                        <>
                            {' '}
                            {t(
                                'ai_copilot_chat_elements_tool_calls.and_breakdown_by',
                            )}{' '}
                            <Badge
                                mx={rem(2)}
                                color="gray"
                                variant="light"
                                size="xs"
                                radius="sm"
                                style={{
                                    textTransform: 'none',
                                    fontWeight: 400,
                                }}
                            >
                                {breakdownByDimension}
                            </Badge>
                        </>
                    )}
                </Text>
            </Group>
        </Stack>
    );
};
