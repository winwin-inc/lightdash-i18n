import { MAX_VALUE_ORDER_ITEMS } from '@lightdash/common';
import { Loader, MultiSelect } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const SEARCH_DEBOUNCE_MS = 300;
/** 行内已选值的固定宽度：约 2~3 个标签，避免把排序行撑开 */
const VALUES_WIDTH = 190;

export type ValueOrderEditorProps = {
    /** Selected values, the array order is the expected order (first = first). */
    values: string[];
    /** Candidate values coming from the database. */
    candidateValues: string[];
    /** Whether the candidate values are being fetched. */
    isCandidatesLoading: boolean;
    /** Error message of the candidate values request, if any. */
    candidatesError: string | undefined;
    /** Disables every interaction of the editor. */
    isDisabled?: boolean;
    /**
     * Called with the current search term, debounced by the editor.
     * The initial (empty) term is not emitted: the parent owns the first load.
     */
    onSearchChange: (search: string) => void;
    /** Called with the new list of selected values, in the new order. */
    onChange: (values: string[]) => void;
};

/**
 * Inline (single line) editor for the custom value order of a dimension.
 *
 * Rendered as a single-line multi select so the sort row keeps its height:
 * the selected values are the tags (their order is the expected order) and the
 * dropdown only offers values that actually exist in the database.
 *
 * Values can only come from `candidateValues`: free text is filtered out in
 * `handleChange`, and values that are already selected are always accepted
 * (so a value that disappeared from the data is not silently dropped).
 */
export const ValueOrderEditor = ({
    values,
    candidateValues,
    isCandidatesLoading,
    candidatesError,
    isDisabled = false,
    onSearchChange,
    onChange,
}: ValueOrderEditorProps) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');

    // Keep the latest callback without restarting the debounce timer.
    const onSearchChangeRef = useRef(onSearchChange);
    onSearchChangeRef.current = onSearchChange;
    const lastEmittedSearch = useRef('');

    useEffect(() => {
        const timeout = setTimeout(() => {
            if (lastEmittedSearch.current === search) return;
            lastEmittedSearch.current = search;
            onSearchChangeRef.current(search);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timeout);
    }, [search]);

    // Empty (or whitespace only) values are not usable: they would render as
    // blank tags and they would never match a value of the database.
    const validCandidateValues = useMemo(
        () => candidateValues.filter((candidate) => candidate.trim().length > 0),
        [candidateValues],
    );

    const selectedValues = useMemo(() => Array.from(new Set(values)), [values]);

    const allowedValues = useMemo(
        () => new Set([...validCandidateValues, ...selectedValues]),
        [selectedValues, validCandidateValues],
    );

    const handleChange = useCallback(
        (nextValues: string[]) => {
            const next = Array.from(new Set(nextValues))
                // 值必须来自数据库：手打的未知值直接丢弃
                .filter((value) => allowedValues.has(value))
                .slice(0, MAX_VALUE_ORDER_ITEMS);
            onChange(next);
        },
        [allowedValues, onChange],
    );

    return (
        <MultiSelect
            size="xs"
            data={validCandidateValues}
            value={selectedValues}
            onChange={handleChange}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            maxSelectedValues={MAX_VALUE_ORDER_ITEMS}
            clearable={false}
            disabled={isDisabled}
            placeholder={t(
                'components_sort_button.custom_order_search_placeholder',
            )}
            nothingFound={t(
                'components_sort_button.custom_order_no_candidates',
            )}
            // 固定宽度：一行只露出 2~3 个已选值，完整顺序看 title
            title={selectedValues.join(' → ')}
            error={candidatesError}
            rightSection={isCandidatesLoading ? <Loader size="xs" /> : null}
            sx={{ width: VALUES_WIDTH, minWidth: VALUES_WIDTH, flex: 'none' }}
        />
    );
};

export default ValueOrderEditor;
