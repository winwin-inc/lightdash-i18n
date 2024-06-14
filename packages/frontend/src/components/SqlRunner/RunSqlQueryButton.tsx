import {
    Box,
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
} from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../common/MantineIcon';

const RunSqlQueryButton: FC<{
    isLoading: boolean;
    onSubmit: () => void;
}> = ({ onSubmit, isLoading }) => {
    const os = useOs();
    const { t } = useTranslation();

    return (
        <Tooltip
            label={
                <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                    <Group spacing="xxs">
                        <Kbd fw={600}>
                            {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                        </Kbd>

                        <Text fw={600}>+</Text>

                        <Kbd fw={600}>Enter</Kbd>
                    </Group>
                </MantineProvider>
            }
            position="bottom"
            withArrow
            withinPortal
            disabled={isLoading}
        >
            <Box>
                <Button
                    size="xs"
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    onClick={onSubmit}
                    loading={isLoading}
                >
                    {t('components_sql_runner_query_button.run_query')}
                </Button>
            </Box>
        </Tooltip>
    );
};

export default RunSqlQueryButton;
