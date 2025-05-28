import {
    FilterOperator,
    friendlyName,
    type FilterDashboardToRule,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconFilter } from '@tabler/icons-react';
import isNil from 'lodash/isNil';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import MantineIcon from '../common/MantineIcon';

type Props = {
    filters: FilterDashboardToRule[];
    onAddFilter?: (filter: FilterDashboardToRule, isTemporary: boolean) => void;
};

export const FilterDashboardTo: FC<Props> = ({ filters, onAddFilter }) => {
    const { t, i18n } = useTranslation();
    const isZh = i18n.language && i18n.language.includes('zh');

    const addDimensionDashboardFilter = useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    );
    const addFilterCallback = onAddFilter ?? addDimensionDashboardFilter;
    return (
        <>
            <Menu.Divider />
            <Menu.Label>
                {t('components_dashboard_filter.filter_dashboard.title')}
            </Menu.Label>

            {filters.map((filter) => (
                <Menu.Item
                    key={filter.id}
                    icon={<MantineIcon icon={IconFilter} />}
                    onClick={() => addFilterCallback(filter, true)}
                >
                    {isZh
                        ? (filter.target as any).tableLabel
                        : friendlyName(filter.target.tableName)}
                    -{' '}
                    {isZh
                        ? (filter.target as any).fieldLabel
                        : friendlyName(filter.target.fieldName)}{' '}
                    is{' '}
                    {filter.operator === FilterOperator.NULL && (
                        <Text span fw={500}>
                            {t(
                                'components_dashboard_filter.filter_dashboard.null',
                            )}
                        </Text>
                    )}
                    {filter.values && !isNil(filter.values[0]) && (
                        <Text span fw={500}>
                            {String(filter.values[0])}
                        </Text>
                    )}
                </Menu.Item>
            ))}
        </>
    );
};
