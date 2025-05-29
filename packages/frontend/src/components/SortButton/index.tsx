import { isField, type SortField } from '@lightdash/common';
import { Badge, Group, Popover, Text } from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconChevronDown,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useColumns } from '../../hooks/useColumns';
import MantineIcon from '../common/MantineIcon';
import Sorting from './Sorting';

export type Props = {
    sorts: SortField[];
    isEditMode: boolean;
};

const SortButton: FC<Props> = ({ sorts, isEditMode }) => {
    const columns = useColumns();
    const { t } = useTranslation();

    const getSortText = () => {
        if (sorts.length === 0) return t('components_sort_button.no_sort');
        if (sorts.length === 1) {
            const sort = sorts[0];
            const column = columns.find((c) => c.id === sort.fieldId);
            const item = column?.meta?.item;
            if (!item) return t('components_sort_button.field');
            return isField(item) ? item.label : item.name;
        }
        return `${sorts.length} ${t('components_sort_button.fields')}`;
    };

    return (
        <Popover
            position="top-start"
            offset={-2}
            withArrow
            shadow="subtle"
            radius="sm"
            withinPortal
            disabled={!isEditMode}
        >
            <Popover.Target>
                <Badge
                    variant="light"
                    color="blue"
                    sx={{
                        textTransform: 'unset',
                        cursor: isEditMode ? 'pointer' : 'default',
                        '&:hover': isEditMode ? { opacity: 0.8 } : undefined,
                        '&:active': isEditMode ? { opacity: 0.9 } : undefined,
                    }}
                    rightSection={
                        isEditMode ? (
                            <MantineIcon icon={IconChevronDown} size="sm" />
                        ) : null
                    }
                >
                    <Group spacing={2}>
                        {sorts.length === 1 && (
                            <MantineIcon
                                icon={
                                    sorts[0].descending
                                        ? IconArrowDown
                                        : IconArrowUp
                                }
                                strokeWidth={3}
                                size="sm"
                            />
                        )}
                        <Text span fw={400}>
                            {t('components_sort_button.sort')}
                        </Text>
                        <Text fw={600}>{getSortText()}</Text>
                    </Group>
                </Badge>
            </Popover.Target>

            <Popover.Dropdown p="xs">
                <Sorting sorts={sorts} isEditMode={isEditMode} />
            </Popover.Dropdown>
        </Popover>
    );
};

export default SortButton;
