import {
    type ApiQueryResults,
    type Field,
    type ItemsMap,
} from '@lightdash/common';
import { Box, Center } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useUnderlyingDataColumns from '../../hooks/useUnderlyingDataColumns';
import { TrackSection } from '../../providers/Tracking/TrackingProvider';
import { SectionName } from '../../types/Events';
import SuboptimalState from '../common/SuboptimalState/SuboptimalState';
import Table from '../common/Table';
import {
    TableHeaderBoldLabel,
    TableHeaderLabelContainer,
    TableHeaderRegularLabel,
} from '../common/Table/Table.styles';
import { type TableColumn } from '../common/Table/types';
import CellContextMenu from './CellContextMenu';

const UnderlyingDataResultsTable: FC<{
    fieldsMap: ItemsMap;
    resultsData: ApiQueryResults | undefined;
    isLoading: boolean;
    hasJoins?: boolean;
    sortByUnderlyingValues: (
        columnA: TableColumn,
        columnB: TableColumn,
    ) => number;
}> = ({
    fieldsMap,
    resultsData,
    isLoading,
    hasJoins,
    sortByUnderlyingValues,
}) => {
    const { t } = useTranslation();

    const columnHeader = useCallback(
        (dimension: Field) => (
            <TableHeaderLabelContainer>
                {hasJoins === true && (
                    <TableHeaderRegularLabel>
                        {dimension.tableLabel}{' '}
                    </TableHeaderRegularLabel>
                )}

                <TableHeaderBoldLabel>{dimension.label}</TableHeaderBoldLabel>
            </TableHeaderLabelContainer>
        ),
        [hasJoins],
    );

    const columns = useUnderlyingDataColumns({
        resultsData,
        fieldsMap,
        columnHeader,
    });

    if (isLoading) {
        return (
            <Center my="lg" miw="70vw">
                <SuboptimalState
                    title={t(
                        'components_metric_query_data.loading_underlying_data',
                    )}
                    loading
                />
            </Center>
        );
    }

    return (
        <TrackSection name={SectionName.RESULTS_TABLE}>
            <Box h="inherit">
                <Table
                    status={'success'}
                    data={resultsData?.rows || []}
                    totalRowsCount={resultsData?.rows.length || 0}
                    isFetchingRows={false}
                    fetchMoreRows={() => undefined}
                    columns={columns.sort(sortByUnderlyingValues)}
                    pagination={{
                        show: true,
                        defaultScroll: true,
                    }}
                    footer={{
                        show: true,
                    }}
                    cellContextMenu={CellContextMenu}
                    $shouldExpand
                />
            </Box>
        </TrackSection>
    );
};

export default UnderlyingDataResultsTable;
