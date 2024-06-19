import {
    slackRequiredScopes,
    type SlackAppCustomSettings,
    type SlackSettings,
} from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Anchor,
    Avatar,
    Badge,
    Box,
    Button,
    Flex,
    Group,
    Loader,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
    IconAlertCircle,
    IconDeviceFloppy,
    IconHelpCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import intersection from 'lodash/intersection';
import { useEffect, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    useDeleteSlack,
    useGetSlack,
    useSlackChannels,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../hooks/slack/useSlack';
import slackSvg from '../../../svgs/slack.svg';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

export const hasRequiredScopes = (slackSettings: SlackSettings) => {
    return (
        intersection(slackSettings.scopes, slackRequiredScopes).length ===
        slackRequiredScopes.length
    );
};

const SLACK_INSTALL_URL = `/api/v1/slack/install/`;

const SlackSettingsPanel: FC = () => {
    const { t } = useTranslation();
    const { data, isError, isInitialLoading } = useGetSlack();
    const isValidSlack = data?.slackTeamName !== undefined && !isError;
    const { data: slackChannels, isInitialLoading: isLoadingSlackChannels } =
        useSlackChannels({
            enabled: isValidSlack,
        });
    const { mutate: deleteSlack } = useDeleteSlack();
    const { mutate: updateCustomSettings } =
        useUpdateSlackAppCustomSettingsMutation();

    const form = useForm<SlackAppCustomSettings>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
        },
    });

    const { setFieldValue, onSubmit } = form;

    useEffect(() => {
        if (!data) return;

        const initialValues = {
            notificationChannel: data.notificationChannel ?? null,
            appProfilePhotoUrl: data.appProfilePhotoUrl ?? null,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    const slackChannelOptions = useMemo(() => {
        return (
            slackChannels?.map((channel) => ({
                value: channel.id,
                label: channel.name,
            })) ?? []
        );
    }, [slackChannels]);

    if (isInitialLoading) {
        return <Loader />;
    }

    const handleSubmit = onSubmit((args) => {
        if (isValidSlack) {
            updateCustomSettings(args);
        }
    });

    return (
        <SettingsGridCard>
            <Stack spacing="sm">
                <Box>
                    <Group spacing="sm">
                        <Avatar src={slackSvg} size="md" />
                        <Title order={4}>
                            {t(
                                'components_user_settings_slack_settings_panel.title',
                            )}
                        </Title>
                    </Group>
                </Box>
            </Stack>

            <Stack>
                <Stack spacing="sm">
                    {isValidSlack && (
                        <Group spacing="xs">
                            <Text fw={500}>
                                {t(
                                    'components_user_settings_slack_settings_panel.add',
                                )}
                            </Text>{' '}
                            <Badge
                                radius="xs"
                                size="lg"
                                color="green"
                                w="fit-content"
                            >
                                <Text span fw={500}>
                                    {data.slackTeamName}
                                </Text>
                            </Badge>
                        </Group>
                    )}

                    <Text color="dimmed" fz="xs">
                        {t(
                            'components_user_settings_slack_settings_panel.content.part_1',
                        )}{' '}
                        <Anchor href="https://docs.lightdash.com/guides/sharing-in-slack">
                            {t(
                                'components_user_settings_slack_settings_panel.content.part_2',
                            )}
                        </Anchor>
                    </Text>
                </Stack>

                {isValidSlack ? (
                    <form onSubmit={handleSubmit}>
                        <Stack spacing="sm">
                            <Select
                                label={
                                    <Group spacing="two" mb="two">
                                        <Text>
                                            {t(
                                                'components_user_settings_slack_settings_panel.from.select.text',
                                            )}
                                        </Text>
                                        <Tooltip
                                            multiline
                                            variant="xs"
                                            maw={250}
                                            label={t(
                                                'components_user_settings_slack_settings_panel.from.select.label',
                                            )}
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                            />
                                        </Tooltip>
                                    </Group>
                                }
                                disabled={isLoadingSlackChannels}
                                size="xs"
                                placeholder={t(
                                    'components_user_settings_slack_settings_panel.from.select.placeholder',
                                )}
                                searchable
                                clearable
                                nothingFound={t(
                                    'components_user_settings_slack_settings_panel.from.select.nothingFound',
                                )}
                                data={slackChannelOptions}
                                {...form.getInputProps('notificationChannel')}
                                onChange={(value) => {
                                    setFieldValue('notificationChannel', value);
                                }}
                            />
                            <Title order={6} fw={500}>
                                {t(
                                    'components_user_settings_slack_settings_panel.from.title',
                                )}
                            </Title>
                            <Group spacing="xl">
                                <Avatar
                                    size="lg"
                                    src={form.values?.appProfilePhotoUrl}
                                    radius="md"
                                    bg="gray.1"
                                />
                                <TextInput
                                    sx={{ flexGrow: 1 }}
                                    label={t(
                                        'components_user_settings_slack_settings_panel.from.profile_photo_url',
                                    )}
                                    size="xs"
                                    placeholder="https://lightdash.cloud/photo.jpg"
                                    type="url"
                                    disabled={!isValidSlack}
                                    {...form.getInputProps(
                                        'appProfilePhotoUrl',
                                    )}
                                    value={
                                        form.values.appProfilePhotoUrl ??
                                        undefined
                                    }
                                />
                            </Group>
                        </Stack>
                        <Stack align="end" mt="xl">
                            <Group spacing="sm">
                                <Group spacing="xs">
                                    <ActionIcon
                                        variant="default"
                                        size="md"
                                        onClick={() => deleteSlack(undefined)}
                                    >
                                        <MantineIcon
                                            icon={IconTrash}
                                            color="red"
                                        />
                                    </ActionIcon>
                                    <Button
                                        size="xs"
                                        component="a"
                                        target="_blank"
                                        variant="default"
                                        href={SLACK_INSTALL_URL}
                                        leftIcon={
                                            <MantineIcon icon={IconRefresh} />
                                        }
                                    >
                                        {t(
                                            'components_user_settings_slack_settings_panel.reinstall',
                                        )}
                                    </Button>
                                </Group>
                                <Button
                                    size="xs"
                                    type="submit"
                                    leftIcon={
                                        <MantineIcon icon={IconDeviceFloppy} />
                                    }
                                >
                                    {t(
                                        'components_user_settings_slack_settings_panel.save',
                                    )}
                                </Button>
                            </Group>

                            {data && !hasRequiredScopes(data) && (
                                <Alert
                                    color="blue"
                                    icon={
                                        <MantineIcon icon={IconAlertCircle} />
                                    }
                                >
                                    {t(
                                        'components_user_settings_slack_settings_panel.tip',
                                    )}
                                </Alert>
                            )}
                        </Stack>
                    </form>
                ) : (
                    <Flex justify="end">
                        <Button
                            size="xs"
                            component="a"
                            target="_blank"
                            color="blue"
                            href={SLACK_INSTALL_URL}
                        >
                            {t(
                                'components_user_settings_slack_settings_panel.add_to_slack',
                            )}
                        </Button>
                    </Flex>
                )}
            </Stack>
        </SettingsGridCard>
    );
};

export default SlackSettingsPanel;
