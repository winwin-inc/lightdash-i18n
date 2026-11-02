import {
    getItemLabelWithoutTableName,
    type SortField,
} from '@lightdash/common';
import { Badge, Group, Popover, Text, Tooltip } from '@mantine/core';
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

    // Values of the fields that are sorted with a custom order, they are
    // shown in the badge so that read only users can tell that the column is
    // not sorted alphabetically.
    const customOrderValues = sorts.flatMap((sort) => sort.valueOrder ?? []);
    const hasCustomOrder = customOrderValues.length > 0;

    const getSortText = () => {
        if (sorts.length === 0) return t('components_sort_button.no_sort');
        if (sorts.length === 1) {
            const sort = sorts[0];
            const column = columns.find((c) => c.id === sort.fieldId);
            const item = column?.meta?.item;
            if (!item) return t('components_sort_button.field');
            return getItemLabelWithoutTableName(item);
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
                        {hasCustomOrder && (
                            <Tooltip
                                label={customOrderValues
                                    .slice(0, 5)
                                    .join(' → ')}
                                withArrow
                                position="top"
                            >
                                <Badge
                                    size="xs"
                                    radius="sm"
                                    variant="filled"
                                    color="blue"
                                    sx={{ textTransform: 'none' }}
                                >
                                    {t(
                                        'components_sort_button.custom_order_badge',
                                    )}
                                </Badge>
                            </Tooltip>
                        )}
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
