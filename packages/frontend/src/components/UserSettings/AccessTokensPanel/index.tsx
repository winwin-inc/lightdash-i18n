import { Button, Group, Stack, Title } from '@mantine/core';
import { IconKey } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useAccessToken } from '../../../hooks/useAccessToken';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { CreateTokenModal } from './CreateTokenModal';
import { TokensTable } from './TokensTable';

const AccessTokensPanel: FC = () => {
    const { t } = useTranslation();
    const { data } = useAccessToken();
    const [isCreatingToken, setIsCreatingToken] = useState(false);
    const hasAvailableTokens = data && data.length > 0;

    return (
        <Stack mb="lg">
            {hasAvailableTokens ? (
                <>
                    <Group position="apart">
                        <Title order={5}>
                            {t(
                                'components_user_settings_access_tokens_panel.personal_access_tokens',
                            )}
                        </Title>
                        <Button onClick={() => setIsCreatingToken(true)}>
                            {t(
                                'components_user_settings_access_tokens_panel.generate_new_token',
                            )}
                        </Button>
                    </Group>
                    <TokensTable />
                </>
            ) : (
                <EmptyState
                    icon={
                        <MantineIcon
                            icon={IconKey}
                            color="gray.6"
                            stroke={1}
                            size="5xl"
                        />
                    }
                    title={t(
                        'components_user_settings_access_tokens_panel.no_tokens',
                    )}
                    description={t(
                        'components_user_settings_access_tokens_panel.no_tokens_tip',
                    )}
                >
                    <Button onClick={() => setIsCreatingToken(true)}>
                        {t(
                            'components_user_settings_access_tokens_panel.generate_token',
                        )}
                    </Button>
                </EmptyState>
            )}

            {isCreatingToken && (
                <CreateTokenModal
                    onBackClick={() => setIsCreatingToken(false)}
                />
            )}
        </Stack>
    );
};

export default AccessTokensPanel;
