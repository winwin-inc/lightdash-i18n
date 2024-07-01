import { Menu, type MenuProps } from '@mantine/core';
import { type FC } from 'react';

import { IconCopy } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../MantineIcon';

type TotalCellMenuProps = {
    onCopy: () => void;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const TotalCellMenu: FC<React.PropsWithChildren<TotalCellMenuProps>> = ({
    children,
    opened,
    onOpen,
    onClose,
    onCopy,
}) => {
    const { t } = useTranslation();

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withinPortal
            closeOnItemClick
            closeOnEscape
            shadow="md"
            radius={0}
            position="bottom-end"
            offset={{
                mainAxis: 0,
                crossAxis: 0,
            }}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconCopy}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                    onClick={onCopy}
                >
                    {t('components_common_pivot_table.copy')}
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

export default TotalCellMenu;
