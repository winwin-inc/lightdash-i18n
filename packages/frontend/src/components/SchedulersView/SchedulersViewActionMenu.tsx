import { ActionIcon, Menu } from '@mantine/core';
import {
    IconDots,
    IconEdit,
    IconSquarePlus,
    IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { SchedulerDeleteModal } from '../../features/scheduler';
import MantineIcon from '../common/MantineIcon';
import {
    getItemLink,
    getSchedulerLink,
    type SchedulerItem,
} from './SchedulersViewUtils';

interface SchedulersViewActionMenuProps {
    isOpen?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
    item: SchedulerItem;
    projectUuid: string;
}

const SchedulersViewActionMenu: FC<SchedulersViewActionMenuProps> = ({
    item,
    projectUuid,
}) => {
    const { t } = useTranslation();
    const [isDeleting, setIsDeleting] = React.useState(false);
    const queryClient = useQueryClient();

    const handleDelete = async () => {
        setIsDeleting(false);
        await queryClient.invalidateQueries(['schedulerLogs']);
    };

    return (
        <>
            <Menu
                withinPortal
                position="bottom-start"
                withArrow
                arrowPosition="center"
                shadow="md"
                offset={-4}
                closeOnItemClick
                closeOnClickOutside
            >
                <Menu.Target>
                    <ActionIcon
                        sx={(theme) => ({
                            ':hover': {
                                backgroundColor: theme.colors.gray[1],
                            },
                        })}
                    >
                        <IconDots size={16} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown maw={320}>
                    <Menu.Item
                        component={Link}
                        role="menuitem"
                        icon={<IconEdit size={18} />}
                        to={getSchedulerLink(item, projectUuid)}
                    >
                        {t(
                            'components_schedulers_view_action_menu.edit_schedule',
                        )}
                    </Menu.Item>
                    <Menu.Item
                        component={Link}
                        role="menuitem"
                        icon={<IconSquarePlus size={18} />}
                        to={getItemLink(item, projectUuid)}
                    >
                        {t('components_schedulers_view_action_menu.go_to')}
                        {item.savedChartUuid
                            ? t('components_schedulers_view_action_menu.chart')
                            : t(
                                  'components_schedulers_view_action_menu.dashboard',
                              )}
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        color="red"
                        icon={<MantineIcon icon={IconTrash} size={18} />}
                        onClick={() => setIsDeleting(true)}
                    >
                        {t(
                            'components_schedulers_view_action_menu.delete_schedule',
                        )}
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            <SchedulerDeleteModal
                opened={isDeleting}
                schedulerUuid={item.schedulerUuid}
                onConfirm={handleDelete}
                onClose={handleDelete}
            />
        </>
    );
};

export default SchedulersViewActionMenu;
