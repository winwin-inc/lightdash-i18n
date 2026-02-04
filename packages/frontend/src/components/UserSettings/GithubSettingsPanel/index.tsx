import {
    Alert,
    Avatar,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconClock,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../../hooks/toaster/useToaster';
import useSearchParams from '../../../hooks/useSearchParams';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    useDeleteGithubInstallationMutation,
    useGitHubRepositories,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import { getApiUrl } from '../../../api';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const GithubSettingsPanel: FC = () => {
    const { t } = useTranslation();
    const { data, isError, isInitialLoading } = useGitHubRepositories();
    const deleteGithubInstallationMutation =
        useDeleteGithubInstallationMutation();

    const status = useSearchParams('status');
    const { showToastWarning } = useToaster();
    const isWaitingForGithubRequest = status === 'github_request_sent';

    const isValidGithubInstallation = data !== undefined && !isError;

    useEffect(() => {
        if (
            isWaitingForGithubRequest &&
            !isValidGithubInstallation &&
            !isInitialLoading
        ) {
            const toastKey = 'github_request_sent';
            showToastWarning({
                title: t(
                    'components_user_settings_github_settings_panel.install_pending.title',
                ),
                subtitle: t(
                    'components_user_settings_github_settings_panel.install_pending.subtitle',
                ),
                key: toastKey,
            });
        }
    }, [
        isWaitingForGithubRequest,
        isValidGithubInstallation,
        isInitialLoading,
        showToastWarning,
        t,
    ]);

    if (isInitialLoading) {
        return <Loader />;
    }

    return (
        <SettingsGridCard>
            <Box>
                <Group spacing="sm">
                    <Avatar src={githubIcon} size="md" />
                    <Title order={4}>
                        {t(
                            'components_user_settings_github_settings_panel.title',
                        )}
                    </Title>
                </Group>
            </Box>

            <Stack>
                <Text color="dimmed" fz="xs">
                    {t(
                        'components_user_settings_github_settings_panel.content.part_1',
                    )}
                </Text>

                {isValidGithubInstallation && data.length === 0 && (
                    <Alert
                        color="blue"
                        icon={<MantineIcon icon={IconAlertCircle} />}
                    >
                        {t(
                            'components_user_settings_github_settings_panel.content.part_2',
                        )}
                    </Alert>
                )}
                {isValidGithubInstallation && data && data.length > 0 && (
                    <Text color="dimmed" fz="xs">
                        {t(
                            'components_user_settings_github_settings_panel.content.part_3',
                        )}
                        <ul>
                            {data.map((repo) => (
                                <li key={repo.fullName}>{repo.fullName}</li>
                            ))}
                        </ul>
                    </Text>
                )}

                {isValidGithubInstallation ? (
                    <Stack align="end">
                        <Group>
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                variant="default"
                                href={getApiUrl('/github/install')}
                                leftIcon={<MantineIcon icon={IconRefresh} />}
                                onClick={() => {
                                    deleteGithubInstallationMutation.mutate(
                                        undefined,
                                        {
                                            onSuccess: () => {
                                                window.open(
                                                    getApiUrl('/github/install'),
                                                    '_blank',
                                                );
                                            },
                                        },
                                    );
                                }}
                            >
                                {t(
                                    'components_user_settings_github_settings_panel.reinstall',
                                )}
                            </Button>
                            <Button
                                size="xs"
                                px="xs"
                                color="red"
                                variant="outline"
                                onClick={() =>
                                    deleteGithubInstallationMutation.mutate()
                                }
                                leftIcon={<MantineIcon icon={IconTrash} />}
                            >
                                {t(
                                    'components_user_settings_github_settings_panel.delete',
                                )}
                            </Button>
                        </Group>
                    </Stack>
                ) : (
                    <Flex justify="end">
                        {isWaitingForGithubRequest ? (
                            <Tooltip
                                multiline
                                maw={400}
                                label={t(
                                    'components_user_settings_github_settings_panel.waiting_for.label',
                                )}
                            >
                                <Button
                                    size="xs"
                                    component="a"
                                    target="_blank"
                                    color="yellow"
                                    variant="outline"
                                    href={getApiUrl('/github/install')}
                                    leftIcon={<MantineIcon icon={IconClock} />}
                                >
                                    {t(
                                        'components_user_settings_github_settings_panel.waiting_for.pending',
                                    )}
                                </Button>
                            </Tooltip>
                        ) : (
                            <Button
                                size="xs"
                                component="a"
                                target="_blank"
                                color="blue"
                                href={getApiUrl('/github/install')}
                            >
                                {t(
                                    'components_user_settings_github_settings_panel.waiting_for.install',
                                )}
                            </Button>
                        )}
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default GithubSettingsPanel;
