import { Button, Menu } from '@mantine/core';

import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import MantineIcon from '../../../../components/common/MantineIcon';

type Props = {
    onClickDuplicate: () => void;
    size?: 'md' | 'xs';
};

/**
 * Reusable button for adding new custom roles that includes a menu to decide between creating
 * a new role or duplicating an existing one.
 */
export const AddRoleButton: FC<Props> = ({ onClickDuplicate, size = 'md' }) => {
    const { t } = useTranslation();

    return (
        <Menu position="bottom-end">
            <Menu.Target>
                <Button size={size} leftIcon={<MantineIcon icon={IconPlus} />}>
                    {t('features_custom_roles_add_button.add_role')}
                </Button>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    component={Link}
                    to="/generalSettings/customRoles/create"
                >
                    {t('features_custom_roles_add_button.create_new_role')}
                </Menu.Item>
                <Menu.Item onClick={onClickDuplicate}>
                    {t(
                        'features_custom_roles_add_button.duplicate_existing_role',
                    )}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
