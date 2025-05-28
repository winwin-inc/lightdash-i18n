import { subject } from '@casl/ability';
import { ActionIcon, Box, Menu } from '@mantine/core';
import {
    IconEdit,
    IconFolderSymlink,
    IconPin,
    IconPinned,
    IconTrash,
} from '@tabler/icons-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';

interface Props {
    isPinned: boolean;
    onRename: () => void;
    onDelete: () => void;
    onTogglePin: () => void;
    onTransferToSpace: () => void;
}

export const SpaceBrowserMenu: React.FC<React.PropsWithChildren<Props>> = ({
    isPinned,
    onRename,
    onDelete,
    onTogglePin,
    onTransferToSpace,
    children,
}) => {
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { t } = useTranslation();

    return (
        <Menu
            withinPortal
            position="bottom-end"
            withArrow
            arrowPosition="center"
            shadow="md"
            closeOnItemClick
            closeOnClickOutside
        >
            <Menu.Target>
                <Box>
                    <ActionIcon>{children}</ActionIcon>
                </Box>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    component="button"
                    role="menuitem"
                    icon={<MantineIcon icon={IconEdit} />}
                    onClick={onRename}
                >
                    {t('components_explorer_space_browser.menus.rename.title')}
                </Menu.Item>

                {user.data?.ability.can(
                    'manage',
                    subject('PinnedItems', {
                        organizationUuid,
                        projectUuid,
                    }),
                ) && (
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={
                            isPinned ? (
                                <MantineIcon icon={IconPinned} />
                            ) : (
                                <MantineIcon icon={IconPin} />
                            )
                        }
                        onClick={onTogglePin}
                    >
                        {isPinned
                            ? t(
                                  'components_explorer_space_browser.menus.toggle_pin.unpin',
                              )
                            : t(
                                  'components_explorer_space_browser.menus.toggle_pin.pin',
                              )}
                    </Menu.Item>
                )}

                <Menu.Divider />

                <Menu.Item
                    component="button"
                    role="menuitem"
                    icon={<IconFolderSymlink size={18} />}
                    onClick={() => {
                        onTransferToSpace();
                    }}
                >
                    {t('components_explorer_space_browser.menus.move')}
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                    component="button"
                    role="menuitem"
                    color="red"
                    icon={<MantineIcon icon={IconTrash} />}
                    onClick={onDelete}
                >
                    {t('components_explorer_space_browser.menus.delete.title')}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
