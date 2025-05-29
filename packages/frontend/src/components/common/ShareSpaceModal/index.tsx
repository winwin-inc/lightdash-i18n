import { type Space } from '@lightdash/common';
import { Alert, Anchor, Box, Button, Stack, Text } from '@mantine/core';
import {
    IconAlertCircle,
    IconFolderShare,
    IconLock,
    IconUsers,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';

import useSearchParams from '../../../hooks/useSearchParams';
import useApp from '../../../providers/App/useApp';
import MantineModal from '../MantineModal';
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
    const SpaceAccessOptions = useSpaceAccessOptions();
    const navigate = useNavigate();
    const shareSpaceModalSearchParam = useSearchParams('shareSpaceModal');
    const [selectedAccess, setSelectedAccess] = useState<AccessOption>(
        space.isPrivate ? SpaceAccessOptions[0] : SpaceAccessOptions[1],
    );
    const { user: sessionUser } = useApp();
    const { t } = useTranslation();

    const [isOpen, setIsOpen] = useState<boolean>(false);
    const isNestedSpace = !!space.parentSpaceUuid;
    const rootSpaceBreadcrumb = space.breadcrumbs?.[0] ?? null;

    useEffect(() => {
        if (shareSpaceModalSearchParam === 'true') {
            setIsOpen(true);
            //clear the search param after opening the modal
            void navigate(`/projects/${projectUuid}/spaces/${space.uuid}`);
        }
    }, [navigate, projectUuid, shareSpaceModalSearchParam, space.uuid]);

    return (
        <>
            <Box>
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
            </Box>

            <MantineModal
                size="xl"
                icon={IconFolderShare}
                title={t('components_common_share_space_modal.share_space', {
                    name: space.name,
                })}
                opened={isOpen}
                onClose={() => setIsOpen(false)}
                actions={
                    !isNestedSpace ? (
                        <Box bg="gray.0">
                            <Text color="gray.7" fz="xs">
                                {selectedAccess.value ===
                                    SpaceAccessType.PRIVATE &&
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
                    ) : null
                }
                modalActionsProps={{
                    bg: 'gray.0',
                }}
            >
                <>
                    <Stack>
                        {isNestedSpace && (
                            <Alert
                                color="blue"
                                icon={<IconAlertCircle size="1rem" />}
                            >
                                <Text color="blue.9">
                                    <Text span weight={600}>
                                        "{space.name}"
                                    </Text>{' '}
                                    {t(
                                        'components_common_share_space_modal.nested_space.part_1',
                                    )}{' '}
                                    <Text span weight={600}>
                                        "
                                        <Anchor
                                            component={Link}
                                            onClick={() => {
                                                setIsOpen(false);
                                            }}
                                            to={`/projects/${projectUuid}/spaces/${rootSpaceBreadcrumb?.uuid}?shareSpaceModal=true`}
                                        >
                                            {rootSpaceBreadcrumb?.name}
                                        </Anchor>
                                        "
                                    </Text>
                                </Text>
                            </Alert>
                        )}

                        <ShareSpaceAddUser
                            space={space}
                            projectUuid={projectUuid}
                            disabled={isNestedSpace}
                        />

                        <ShareSpaceAccessType
                            projectUuid={projectUuid}
                            space={space}
                            selectedAccess={selectedAccess}
                            setSelectedAccess={setSelectedAccess}
                            disabled={isNestedSpace}
                        />

                        <ShareSpaceUserList
                            projectUuid={projectUuid}
                            space={space}
                            sessionUser={sessionUser.data}
                            disabled={isNestedSpace}
                        />
                    </Stack>
                </>
            </MantineModal>
        </>
    );
};

export default ShareSpaceModal;
