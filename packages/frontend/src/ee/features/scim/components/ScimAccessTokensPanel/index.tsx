import {
    Anchor,
    Button,
    Group,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    SettingsCard,
    SettingsGridCard,
} from '../../../../../components/common/Settings/SettingsCard';
import useToaster from '../../../../../hooks/toaster/useToaster';
import useApp from '../../../../../providers/App/useApp';
import { useScimTokenList } from '../../hooks/useScimAccessToken';
import { CreateTokenModal } from './CreateTokenModal';
import { TokensTable } from './TokensTable';

const ScimAccessTokensPanel: FC = () => {
    const { t } = useTranslation();

    const { data } = useScimTokenList();
    const [isCreatingToken, setIsCreatingToken] = useState(false);
    const hasAvailableTokens = data && data.length > 0;
    const { health } = useApp();
    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });

    const scimURL = `${health?.data?.siteUrl}/api/v1/scim/v2`;

    const handleCopyToClipboard = useCallback(() => {
        clipboard.copy(scimURL);
        showToastSuccess({
            title: t('ai_scim_access_tokens_panel_main.copied_to_clipboard'),
        });
    }, [scimURL, clipboard, showToastSuccess, t]);

    return (
        <Stack mb="lg">
            <Group position="apart">
                <Title order={5}>SCIM access tokens</Title>
                <Button onClick={() => setIsCreatingToken(true)}>
                    {t('ai_scim_access_tokens_panel_main.generate_new_token')}
                </Button>
            </Group>

            <SettingsGridCard>
                <Stack spacing="sm">
                    <Title order={4}>
                        {t('ai_scim_access_tokens_panel_main.scim_url')}
                    </Title>
                    <Text color="dimmed">
                        {t(
                            'ai_scim_access_tokens_panel_main.connect_your_identity_provider_to_lightdash_via_scim',
                        )}
                    </Text>
                    <Anchor
                        href="https://docs.lightdash.com/references/scim-integration/"
                        target="_blank"
                    >
                        {t('ai_scim_access_tokens_panel_main.learn_more')}
                    </Anchor>
                </Stack>
                <TextInput
                    value={scimURL}
                    readOnly
                    rightSection={
                        <Button
                            variant="subtle"
                            onClick={handleCopyToClipboard}
                            compact
                        >
                            <IconCopy size={16} />
                        </Button>
                    }
                />
            </SettingsGridCard>

            {hasAvailableTokens ? (
                <TokensTable />
            ) : (
                <SettingsCard shadow="none">
                    {t('ai_scim_access_tokens_panel_main.has_available_tokens')}
                </SettingsCard>
            )}

            {isCreatingToken && (
                <CreateTokenModal
                    onBackClick={() => setIsCreatingToken(false)}
                />
            )}
        </Stack>
    );
};

export default ScimAccessTokensPanel;
