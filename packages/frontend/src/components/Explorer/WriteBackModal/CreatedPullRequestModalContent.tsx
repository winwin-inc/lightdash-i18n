import { Anchor, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconGitBranch } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';

export const CreatedPullRequestModalContent = ({
    onClose,
    data,
}: {
    onClose: () => void;
    data: { prUrl: string };
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            size="xl"
            onClick={(e) => e.stopPropagation()}
            opened={true}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon
                        icon={IconGitBranch}
                        size="lg"
                        color="gray.7"
                    />
                    <Text fw={500}>
                        {t('components_explorer_write_back_modal.title')}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <Stack p="md">
                <Text>
                    {t('components_explorer_write_back_modal.content.part_1')}{' '}
                    <Anchor href={data.prUrl} target="_blank" span fw={700}>
                        #{data.prUrl.split('/').pop()}
                    </Anchor>{' '}
                    {t('components_explorer_write_back_modal.content.part_2')}
                    <Text pt="md">
                        {t(
                            'components_explorer_write_back_modal.content.part_3',
                        )}
                    </Text>
                </Text>
            </Stack>
            <Group position="right" w="100%" p="md">
                <Button
                    color="gray.7"
                    onClick={onClose}
                    variant="outline"
                    size="xs"
                >
                    {t('components_explorer_write_back_modal.close')}
                </Button>
            </Group>
        </Modal>
    );
};
