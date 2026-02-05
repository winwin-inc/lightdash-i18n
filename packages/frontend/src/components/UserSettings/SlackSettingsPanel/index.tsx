import {
    CommercialFeatureFlags,
    type SlackAppCustomSettings,
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
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import {
    IconAlertCircle,
    IconDeviceFloppy,
    IconHelpCircle,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import debounce from 'lodash/debounce';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { z } from 'zod';

import {
    useDeleteSlack,
    useGetSlack,
    useSlackChannels,
    useUpdateSlackAppCustomSettingsMutation,
} from '../../../hooks/slack/useSlack';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useFeatureFlag } from '../../../hooks/useFeatureFlagEnabled';
import slackSvg from '../../../svgs/slack.svg';
import MantineIcon from '../../common/MantineIcon';
import { SettingsGridCard } from '../../common/Settings/SettingsCard';

const MAX_SLACK_CHANNELS = 100000;

const SlackSettingsPanel: FC = () => {
    const { t } = useTranslation();

    const { activeProjectUuid } = useActiveProjectUuid();
    const { data: aiCopilotFlag } = useFeatureFlag(
        CommercialFeatureFlags.AiCopilot,
    );
    const { data: slackInstallation, isInitialLoading } = useGetSlack();
    const organizationHasSlack = !!slackInstallation?.organizationUuid;

    const [search, setSearch] = useState('');

    const debounceSetSearch = debounce((val) => setSearch(val), 1500);

    const { data: slackChannels, isInitialLoading: isLoadingSlackChannels } =
        useSlackChannels(
            search,
            {
                excludeArchived: true,
                excludeDms: true,
                excludeGroups: true,
            },
            { enabled: organizationHasSlack },
        );

    const formSchema = z.object({
        notificationChannel: z.string().min(1).nullable(),
        appProfilePhotoUrl: z.string().url().nullable(),
        slackChannelProjectMappings: z.array(
            z.object({
                projectUuid: z
                    .string({
                        message: t(
                            'components_user_settings_slack_settings_panel.validation.project',
                        ),
                    })
                    .uuid({
                        message: t(
                            'components_user_settings_slack_settings_panel.validation.invalid_project',
                        ),
                    }),
                slackChannelId: z
                    .string({
                        message: t(
                            'components_user_settings_slack_settings_panel.validation.slack_channel',
                        ),
                    })
                    .min(1),
                availableTags: z.array(z.string().min(1)).nullable(),
            }),
        ),
    });

    const { mutate: deleteSlack } = useDeleteSlack();
    const { mutate: updateCustomSettings } =
        useUpdateSlackAppCustomSettingsMutation();

    const form = useForm<SlackAppCustomSettings>({
        initialValues: {
            notificationChannel: null,
            appProfilePhotoUrl: null,
            slackChannelProjectMappings: [],
            aiThreadAccessConsent: false,
            aiRequireOAuth: false,
        },
        validate: zodResolver(formSchema),
    });

    const { setFieldValue, onSubmit } = form;

    useEffect(() => {
        if (!slackInstallation) return;

        const initialValues = {
            notificationChannel: slackInstallation.notificationChannel ?? null,
            appProfilePhotoUrl: slackInstallation.appProfilePhotoUrl ?? null,
            slackChannelProjectMappings:
                slackInstallation.slackChannelProjectMappings ?? [],
            aiThreadAccessConsent:
                slackInstallation.aiThreadAccessConsent ?? false,
            aiRequireOAuth: slackInstallation.aiRequireOAuth ?? false,
        };

        if (form.initialized) {
            form.setInitialValues(initialValues);
            form.setValues(initialValues);
        } else {
            form.initialize(initialValues);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackInstallation]);

    const slackChannelOptions = useMemo(() => {
        return (
            slackChannels?.map((channel) => ({
                value: channel.id,
                label: channel.name,
            })) ?? []
        );
    }, [slackChannels]);

    let responsiveChannelsSearchEnabled =
        slackChannelOptions.length >= MAX_SLACK_CHANNELS || search.length > 0; // enable responvive channels search if there are more than MAX_SLACK_CHANNELS defined channels

    if (isInitialLoading) {
        return <Loader />;
    }

    const handleSubmit = onSubmit((args) => {
        if (organizationHasSlack) {
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
                    {organizationHasSlack && (
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
                                    {slackInstallation.slackTeamName}
                                </Text>
                            </Badge>
                        </Group>
                    )}

                    <Text color="dimmed" fz="xs">
                        {t(
                            'components_user_settings_slack_settings_panel.content.part_1',
                        )}{' '}
                        <Anchor href="https://docs.lightdash.com/references/slack-integration">
                            {t(
                                'components_user_settings_slack_settings_panel.content.part_2',
                            )}
                        </Anchor>
                    </Text>
                </Stack>

                {organizationHasSlack ? (
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
                                size="xs"
                                rightSection={
                                    isLoadingSlackChannels ? (
                                        <Loader size="xs" />
                                    ) : null
                                }
                                placeholder={
                                    isLoadingSlackChannels
                                        ? t(
                                              'components_user_settings_slack_settings_panel.from.select.loading',
                                          )
                                        : t(
                                              'components_user_settings_slack_settings_panel.from.select.placeholder',
                                          )
                                }
                                searchable
                                clearable
                                limit={500}
                                nothingFound={t(
                                    'components_user_settings_slack_settings_panel.from.select.nothingFound',
                                )}
                                data={slackChannelOptions}
                                {...form.getInputProps('notificationChannel')}
                                onSearchChange={(val) => {
                                    if (responsiveChannelsSearchEnabled) {
                                        debounceSetSearch(val);
                                    }
                                }}
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
                                    disabled={!organizationHasSlack}
                                    {...form.getInputProps(
                                        'appProfilePhotoUrl',
                                    )}
                                    value={
                                        form.values.appProfilePhotoUrl ??
                                        undefined
                                    }
                                />
                            </Group>
                            {aiCopilotFlag?.enabled && (
                                <Stack spacing="sm">
                                    <Group spacing="two">
                                        <Title order={6} fw={500}>
                                            {t(
                                                'components_user_settings_slack_settings_panel.ai_copilot_flag.title',
                                            )}
                                        </Title>

                                        <Tooltip
                                            multiline
                                            variant="xs"
                                            maw={250}
                                            label={t(
                                                'components_user_settings_slack_settings_panel.ai_copilot_flag.description',
                                            )}
                                        >
                                            <MantineIcon
                                                icon={IconHelpCircle}
                                            />
                                        </Tooltip>
                                    </Group>

                                    <Text c="dimmed" fz="xs">
                                        {t(
                                            'components_user_settings_slack_settings_panel.ai_copilot_flag.allow_thread_messages',
                                        )}
                                    </Text>

                                    <Switch
                                        label={t(
                                            'components_user_settings_slack_settings_panel.ai_copilot_flag.allow_thread_messages',
                                        )}
                                        checked={
                                            form.values.aiThreadAccessConsent ??
                                            false
                                        }
                                        onChange={(event) => {
                                            setFieldValue(
                                                'aiThreadAccessConsent',
                                                event.currentTarget.checked,
                                            );
                                        }}
                                    />
                                    <Text fz="xs" c="dimmed">
                                        {t(
                                            'components_user_settings_slack_settings_panel.ai_copilot_flag.configure.part_1',
                                        )}{' '}
                                        <Anchor
                                            component={Link}
                                            to={`/projects/${activeProjectUuid}/ai-agents`}
                                        >
                                            {t(
                                                'components_user_settings_slack_settings_panel.ai_copilot_flag.configure.part_2',
                                            )}
                                        </Anchor>
                                        .
                                    </Text>

                                    <Stack spacing="sm">
                                        <Group spacing="two">
                                            <Title order={6} fw={500}>
                                                {t(
                                                    'components_user_settings_slack_settings_panel.ai_copilot_flag.ai_agents_oauth_requirement.title',
                                                )}
                                            </Title>

                                            <Tooltip
                                                multiline
                                                variant="xs"
                                                maw={250}
                                                label={t(
                                                    'components_user_settings_slack_settings_panel.ai_copilot_flag.ai_agents_oauth_requirement.description',
                                                )}
                                            >
                                                <MantineIcon
                                                    icon={IconHelpCircle}
                                                />
                                            </Tooltip>
                                        </Group>

                                        <Switch
                                            label={t(
                                                'components_user_settings_slack_settings_panel.ai_copilot_flag.require_oauth_for_ai_agent',
                                            )}
                                            checked={form.values.aiRequireOAuth}
                                            onChange={(event) => {
                                                setFieldValue(
                                                    'aiRequireOAuth',
                                                    event.currentTarget.checked,
                                                );
                                            }}
                                        />
                                    </Stack>
                                </Stack>
                            )}
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
                                        href={'/api/v1/slack/install/'}
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

                            {organizationHasSlack &&
                                !slackInstallation.hasRequiredScopes && (
                                    <Alert
                                        color="yellow"
                                        icon={
                                            <MantineIcon
                                                icon={IconAlertCircle}
                                            />
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
                            href={'/api/v1/slack/install/'}
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
