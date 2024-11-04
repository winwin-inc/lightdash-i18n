import { SortByDirection, type VizSortBy } from '@lightdash/common';
import { Box, Select, Text, Tooltip, useMantineTheme } from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { forwardRef, type ComponentPropsWithoutRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../common/MantineIcon';
import { usePillSelectStyles } from '../hooks/usePillSelectStyles';

const SortIcon: FC<{ sortByDirection: VizSortBy['direction'] }> = ({
    sortByDirection,
}) => {
    let icon;
    switch (sortByDirection) {
        case SortByDirection.ASC:
            icon = IconArrowRight;
            break;
        case SortByDirection.DESC:
            icon = IconArrowLeft;
            break;
    }

    return icon ? <MantineIcon color="gray.6" icon={icon} /> : null;
};

type Props = {
    sortBy: VizSortBy['direction'] | undefined;
    onChangeSortBy: (value: VizSortBy['direction'] | undefined) => void;
};

const SortItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        label: string;
        value: SortByDirection | undefined;
        selected: boolean;
    }
>(({ value, label, ...others }, ref) => {
    const { t } = useTranslation();

    const getSortLabel = (sort: SortByDirection | undefined) => {
        switch (sort) {
            case SortByDirection.ASC:
                return t('components_dataviz_sort_config.sort.asc');
            case SortByDirection.DESC:
                return t('components_dataviz_sort_config.sort.desc');
            default:
                return t('components_dataviz_sort_config.sort.no_sort');
        }
    };

    return (
        <Box ref={ref} {...others}>
            <Text>{getSortLabel(value)}</Text>
        </Box>
    );
});

export const DataVizSortConfig: FC<Props> = ({ sortBy, onChangeSortBy }) => {
    const { t } = useTranslation();

    const { colors } = useMantineTheme();
    const { classes, cx } = usePillSelectStyles({
        backgroundColor: colors.gray[2],
        textColor: colors.gray[7],
        hoverColor: colors.gray[3],
    });

    const selectOptions = [
        {
            value: 'none',
            label: t('components_dataviz_sort_config.select.no_sort'),
        },
        {
            value: SortByDirection.ASC,
            label: t('components_dataviz_sort_config.select.asc'),
        },
        {
            value: SortByDirection.DESC,
            label: t('components_dataviz_sort_config.select.desc'),
        },
    ];

    return (
        <Tooltip
            label={t('components_dataviz_sort_config.sort_by')}
            variant="xs"
            withinPortal
        >
            <Select
                withinPortal
                data={selectOptions}
                itemComponent={SortItem}
                value={sortBy ?? selectOptions[0].value}
                onChange={(value: SortByDirection | 'none') =>
                    onChangeSortBy(value === 'none' ? undefined : value)
                }
                icon={sortBy ? <SortIcon sortByDirection={sortBy} /> : null}
                classNames={{
                    item: classes.item,
                    dropdown: classes.dropdown,
                    input: cx(
                        classes.input,
                        !sortBy && classes.inputUnsetValue,
                    ),
                    rightSection: classes.rightSection,
                }}
                styles={{
                    input: {
                        width: '105px',
                    },
                }}
            />
        </Tooltip>
    );
};
