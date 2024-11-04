import { type Space } from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    useMantineTheme,
} from '@mantine/core';
import { IconFolderShare, IconLock, IconUsers } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../MantineIcon';
import { ShareSpaceAccessType } from './ShareSpaceAccessType';
import { ShareSpaceAddUser } from './ShareSpaceAddUser';
import {
    SpaceAccessType,
    useSpaceAccessOptions,
    type AccessOption,
} from './ShareSpaceSelect';
import { ShareSpaceUserList } from './ShareSpaceUserList';

export interface ShareSpaceProps {
    space: Space;
    projectUuid: string;
}

const ShareSpaceModal: FC<ShareSpaceProps> = ({ space, projectUuid }) => {
    const theme = useMantineTheme();
    const SpaceAccessOptions = useSpaceAccessOptions();
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        space.isPrivate ? SpaceAccessOptions[0] : SpaceAccessOptions[1],
    );
    const { user: sessionUser } = useApp();
    const { t } = useTranslation();

    const [isOpen, setIsOpen] = useState<boolean>(false);

    return (
        <>
            <Button
                leftIcon={
                    selectedAccess.value === SpaceAccessType.PRIVATE ? (
                        <IconLock size={18} />
                    ) : (
                        <IconUsers size={18} />
                    )
                }
                onClick={() => {
                    setIsOpen(true);
                }}
                variant="default"
            >
                {t('components_common_share_space_modal.share')}
            </Button>

            <Modal
                size="xl"
                title={
                    <Group spacing="xs">
                        <MantineIcon size="lg" icon={IconFolderShare} />
                        <Title order={4}>
                            {t('components_common_share_space_modal.share', {
                                name: space.name,
                            })}
                        </Title>
                    </Group>
                }
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                styles={{
                    body: {
                        padding: 0,
                    },
                }}
            >
                <>
                    <Stack p="md" pt={0}>
                        <ShareSpaceAddUser
                            space={space}
                            projectUuid={projectUuid}
                        />

                        <ShareSpaceAccessType
                            projectUuid={projectUuid}
                            space={space}
                            selectedAccess={selectedAccess}
                            setSelectedAccess={setSelectedAccess}
                        />

                        <ShareSpaceUserList
                            projectUuid={projectUuid}
                            space={space}
                            sessionUser={sessionUser.data}
                        />
                    </Stack>

                    <Box
                        bg="gray.0"
                        p="md"
                        sx={{
                            borderTop: `1px solid ${theme.colors.gray[2]}`,
                            padding: 'md',
                        }}
                    >
                        <Text color="gray.7" fz="xs">
                            {selectedAccess.value === SpaceAccessType.PRIVATE &&
                            sessionUser.data?.ability?.can(
                                'create',
                                'InviteLink',
                            ) ? (
                                <>
                                    {t(
                                        'components_common_share_space_modal.private.part_1',
                                    )}{' '}
                                    <Anchor
                                        component={Link}
                                        to={`/generalSettings/projectManagement/${projectUuid}/projectAccess`}
                                    >
                                        {t(
                                            'components_common_share_space_modal.private.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_common_share_space_modal.private.part_3',
                                    )}
                                </>
                            ) : (
                                <>
                                    {t(
                                        'components_common_share_space_modal.private.part_4',
                                    )}{' '}
                                    <Anchor
                                        href="https://docs.lightdash.com/references/roles"
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_common_share_space_modal.private.part_5',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_common_share_space_modal.private.part_6',
                                    )}
                                </>
                            )}
                        </Text>
                    </Box>
                </>
            </Modal>
        </>
    );
};

export default ShareSpaceModal;
