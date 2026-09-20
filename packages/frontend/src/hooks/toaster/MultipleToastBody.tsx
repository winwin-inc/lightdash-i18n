import {
    ActionIcon,
    Button,
    Collapse,
    Group,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconX } from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import rehypeExternalLinks from 'rehype-external-links';
import MantineIcon from '../../components/common/MantineIcon';
import ApiErrorDisplay from './ApiErrorDisplay';
import { type NotificationData } from './types';

const MultipleToastBody = ({
    toastsData,
    onCloseError,
}: {
    title?: ReactNode;
    toastsData: NotificationData[];
    onCloseError?: (errorData: NotificationData) => void;
}) => {
    const { t } = useTranslation();
    const [listCollapsed, setListCollapsed] = useState(true);

    return (
        <Stack spacing="xs" align="stretch">
            <Group>
                <Title order={6}>{t('hooks_toaster.errors')}</Title>
                <Button
                    size="xs"
                    compact
                    variant="outline"
                    color="red.1"
                    rightIcon={
                        <MantineIcon
                            color="red.1"
                            icon={
                                listCollapsed ? IconChevronUp : IconChevronDown
                            }
                        />
                    }
                    onClick={() => setListCollapsed(!listCollapsed)}
                >
                    <Text>
                        {t(
                            listCollapsed
                                ? 'hooks_toaster.show_count'
                                : 'hooks_toaster.hide_count',
                            { count: toastsData.length },
                        )}
                    </Text>
                </Button>
            </Group>

            <Collapse
                in={!listCollapsed}
                style={{
                    maxHeight: 155,
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Stack spacing="xs" pb="sm">
                    {toastsData.map((toastData, index) => (
                        <Group
                            key={`${toastData.subtitle}-${index}`}
                            position="apart"
                            spacing="xxs"
                            noWrap
                            sx={(theme) => ({
                                width: '100%',
                                border: `1px solid ${theme.colors.red[3]}`,
                                borderRadius: '4px',
                                padding: theme.spacing.xs,
                            })}
                        >
                            {toastData.apiError ? (
                                <ApiErrorDisplay
                                    apiError={toastData.apiError}
                                    onClose={() => onCloseError?.(toastData)}
                                />
                            ) : (
                                <>
                                    {toastData.title && (
                                        <Title order={6}>
                                            {toastData.title}
                                        </Title>
                                    )}
                                    {toastData.subtitle && (
                                        <MarkdownPreview
                                            source={toastData.subtitle.toString()}
                                            rehypePlugins={[
                                                [
                                                    rehypeExternalLinks,
                                                    { target: '_blank' },
                                                ],
                                            ]}
                                            style={{
                                                backgroundColor: 'transparent',
                                                color: 'white',
                                                fontSize: '12px',
                                            }}
                                        />
                                    )}
                                </>
                            )}

                            <ActionIcon
                                variant="transparent"
                                size="xs"
                                onClick={() => onCloseError?.(toastData)}
                            >
                                <MantineIcon icon={IconX} color="white" />
                            </ActionIcon>
                        </Group>
                    ))}
                </Stack>
            </Collapse>
        </Stack>
    );
};

export default MultipleToastBody;
