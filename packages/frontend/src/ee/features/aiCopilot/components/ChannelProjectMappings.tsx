import { type SlackAppCustomSettings } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Divider,
    Group,
    Paper,
    Radio,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import type { UseFormReturnType } from '@mantine/form';
import {
    IconArrowsHorizontal,
    IconDatabase,
    IconHash,
    IconHelpCircle,
    IconPlus,
    IconRefresh,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../components/common/MantineIcon';
import { TagInput } from '../../../../components/common/TagInput/TagInput';
import { useSlackChannels } from '../../../../hooks/slack/useSlack';

type Props = {
    channelOptions: { value: string; label: string }[];
    projectOptions: { value: string; label: string }[];
    form: UseFormReturnType<SlackAppCustomSettings>;
};

type ChannelProjectMappingProps = Props & {
    index: number;
    usedChannels: string[];
    onDelete: () => void;
};

const ChannelProjectMapping: FC<ChannelProjectMappingProps> = ({
    form,
    index,
    channelOptions,
    projectOptions,
    usedChannels,
    onDelete,
}) => {
    const { t } = useTranslation();

    const showTagsInput =
        form.values.slackChannelProjectMappings?.[index]?.availableTags !==
        null;

    return (
        <Paper py="xs" shadow="xs" withBorder>
            <Stack spacing="xs">
                <Group px="xs" spacing="xs" noWrap>
                    <Select
                        size="xs"
                        data={projectOptions}
                        searchable
                        placeholder={t('ai_copilot_channel_project_mappings.select_project')}
                        icon={<MantineIcon icon={IconDatabase} />}
                        {...form.getInputProps(
                            `slackChannelProjectMappings.${index}.projectUuid`,
                        )}
                    />

                    <MantineIcon icon={IconArrowsHorizontal} color="gray.5" />

                    <Select
                        size="xs"
                        data={channelOptions.map((channel) => ({
                            value: channel.value,
                            label: channel.label.replace(/^#/, ''),
                            disabled: usedChannels.includes(channel.value),
                        }))}
                        searchable
                        placeholder={t('ai_copilot_channel_project_mappings.select_channel')}
                        icon={<MantineIcon icon={IconHash} />}
                        {...form.getInputProps(
                            `slackChannelProjectMappings.${index}.slackChannelId`,
                        )}
                    />

                    <ActionIcon onClick={onDelete}>
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Group>

                <Divider />

                <Stack px="xs" spacing="xs">
                    <Radio.Group
                        size="xs"
                        label={t('ai_copilot_channel_project_mappings.configure_available_tags')}
                        value={showTagsInput ? 'tags' : 'all'}
                        onChange={(value) => {
                            form.setFieldValue(
                                `slackChannelProjectMappings.${index}.availableTags`,
                                value === 'all' ? null : [],
                            );
                        }}
                    >
                        <Stack spacing="xs" pt="xs">
                            <Radio
                                value="all"
                                label={t('ai_copilot_channel_project_mappings.radio_group.all')}
                            />
                            <Radio
                                value="tags"
                                label={t('ai_copilot_channel_project_mappings.radio_group.tags')}
                            />

                            {showTagsInput && (
                                <TagInput
                                    size="xs"
                                    placeholder={t('ai_copilot_channel_project_mappings.radio_group.placeholder')}
                                    {...form.getInputProps(
                                        `slackChannelProjectMappings.${index}.availableTags`,
                                    )}
                                />
                            )}
                        </Stack>
                    </Radio.Group>
                </Stack>
            </Stack>
        </Paper>
    );
};

const ChannelProjectMappings: FC<Props> = ({
    channelOptions,
    projectOptions,
    form,
}) => {
    const { t } = useTranslation();

    const mappings = form.values.slackChannelProjectMappings;

    const usedChannels = useMemo(() => {
        return mappings?.map((mapping) => mapping.slackChannelId) ?? [];
    }, [mappings]);

    const handleDelete = useCallback(
        (index: number) =>
            form.removeListItem('slackChannelProjectMappings', index),
        [form],
    );

    const handleAdd = useCallback(
        () =>
            form.insertListItem('slackChannelProjectMappings', {
                projectUuid: null,
                slackChannelId: null,
                availableTags: null,
            }),
        [form],
    );

    const { refresh: refreshChannels, isLoading: isRefreshing } =
        useSlackChannels('');

    return (
        <Stack spacing="sm" w="100%">
            <Group position="apart" spacing="two" mb="two">
                <Group spacing="two">
                    <Title order={6} fw={500}>
                        {t('ai_copilot_channel_project_mappings.ai_bot_channel_mappings.title')}
                    </Title>

                    <Tooltip
                        variant="xs"
                        multiline
                        maw={250}
                        label={t('ai_copilot_channel_project_mappings.ai_bot_channel_mappings.content')}
                    >
                        <MantineIcon icon={IconHelpCircle} />
                    </Tooltip>
                </Group>

                <Tooltip
                    variant="xs"
                    multiline
                    maw={250}
                    label={
                        <Text fw={500}>
                            {t('ai_copilot_channel_project_mappings.tooltip_refresh.label')}
                            <Text c="gray.4" fw={400}>
                                {t('ai_copilot_channel_project_mappings.tooltip_refresh.content')}
                            </Text>
                        </Text>
                    }
                >
                    <ActionIcon
                        loading={isRefreshing}
                        onClick={refreshChannels}
                    >
                        <MantineIcon icon={IconRefresh} />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Stack spacing="sm">
                {form.values.slackChannelProjectMappings?.map(
                    (mapping, index) => (
                        <ChannelProjectMapping
                            key={`${mapping.projectUuid}-${mapping.slackChannelId}`}
                            form={form}
                            index={index}
                            projectOptions={projectOptions}
                            channelOptions={channelOptions}
                            usedChannels={usedChannels}
                            onDelete={() => handleDelete(index)}
                        />
                    ),
                )}

                <div>
                    <Button
                        disabled={!form.isValid()}
                        onClick={handleAdd}
                        leftIcon={<MantineIcon icon={IconPlus} />}
                        size="xs"
                    >
                        {t('ai_copilot_channel_project_mappings.add_new_mapping')}
                    </Button>
                </div>
            </Stack>
        </Stack>
    );
};

export default ChannelProjectMappings;
