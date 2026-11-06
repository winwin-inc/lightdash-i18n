import { type FilterableDimension } from '@lightdash/common';
import { type FC, useMemo, useState } from 'react';

import { useFieldValues } from '../../hooks/useFieldValues';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import ValueOrderEditor from './ValueOrderEditor';

type Props = {
    /**
     * The dimension the custom order applies to.
     * Only string dimensions are supported (the value order is built as a
     * `CASE WHEN ... THEN rank` expression on textual values).
     */
    field: FilterableDimension;
    /** Currently selected values, the array order is the expected order. */
    values: string[];
    /** Called with the new list of selected values, in the new order. */
    onChange: (values: string[]) => void;
};

/**
 * Stable reference so that `useFieldValues` does not see a new array on
 * every render of the container.
 */
const NO_INITIAL_VALUES: string[] = [];

/**
 * Connects the (controlled) ValueOrderEditor to the database.
 *
 * The candidate values are the distinct values of the field, fetched with the
 * field values search API. `useFieldValues` already handles the heavy lifting:
 * the requests go through a serial queue (the endpoint runs a `GROUP BY` query
 * with the dbt sql_filter) and requests for the same field are deduplicated.
 *
 * The sorting configuration is intentionally decoupled from the current
 * filters (`filterId`/`filters` are undefined): sorting is a chart level
 * configuration, so the available values must not change when the user
 * changes the filters of the chart.
 */
const ValueOrderEditorContainer: FC<Props> = ({ field, values, onChange }) => {
    const [search, setSearch] = useState('');
    const projectUuid = useProjectUuid();

    const { results, isInitialLoading, isFetching, error } = useFieldValues(
        search,
        NO_INITIAL_VALUES,
        projectUuid,
        field,
        undefined,
        undefined,
        // ValueOrderEditor already debounces the search term (300ms);
        // without this the request would wait for another 500ms.
        false,
    );

    const candidateValues = useMemo(() => [...results], [results]);

    return (
        <ValueOrderEditor
            values={values}
            candidateValues={candidateValues}
            isCandidatesLoading={isInitialLoading || isFetching}
            candidatesError={error?.error?.message}
            onSearchChange={setSearch}
            onChange={onChange}
        />
    );
};

export default ValueOrderEditorContainer;
