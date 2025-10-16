import {
    getItemId,
    type CustomDimension,
    type Field,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { Menu, Text } from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import {
    SortDirection,
    getSortDirectionOrder,
    getSortLabel,
} from '../../../utils/sortUtils';
import MantineIcon from '../../common/MantineIcon';

type Props = {
    item: Field | TableCalculation | CustomDimension;
    sort: SortField | undefined;
};

const ColumnHeaderSortMenuOptions: FC<Props> = ({ item, sort }) => {
    const { t } = useTranslation();

    const itemFieldId = getItemId(item);
    const hasSort = !!sort;
    const selectedSortDirection = sort
        ? sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC
        : undefined;

    const dispatch = useExplorerDispatch();

    const handleSortClick = useCallback(
        (sortDirection: SortDirection) => {
            if (hasSort && selectedSortDirection === sortDirection) {
                // Remove sort - clicking on current direction removes it
                dispatch(explorerActions.setSortFields([]));
            } else {
                // Replace ALL sorts with this single sort
                const newSort: SortField = {
                    fieldId: itemFieldId,
                    descending: sortDirection === SortDirection.DESC,
                };
                dispatch(explorerActions.setSortFields([newSort]));
            }
        },
        [dispatch, hasSort, itemFieldId, selectedSortDirection],
    );

    return (
        <>
            <Menu.Label>{t(
                            'components_explorer_results_card_column_context_menu.sorting',
                        )}</Menu.Label>
            {item &&
                getSortDirectionOrder(item).map((sortDirection) => (
                    <Menu.Item
                        key={sortDirection}
                        icon={
                            hasSort &&
                                selectedSortDirection === sortDirection ? (
                                <MantineIcon icon={IconCheck} />
                            ) : undefined
                        }
                        disabled={
                            hasSort && selectedSortDirection === sortDirection
                        }
                        onClick={() => handleSortClick(sortDirection)}
                    >
                        {t(
                            'components_explorer_results_card_column_context_menu.sort',
                        )}{' '}
                        <Text span fw={500}>
                            {getSortLabel(item, sortDirection)}
                        </Text>
                    </Menu.Item>
                ))}
        </>
    );
};

export default ColumnHeaderSortMenuOptions;
