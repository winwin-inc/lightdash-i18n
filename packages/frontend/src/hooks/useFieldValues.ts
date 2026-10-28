import {
    getFilterRulesFromGroup,
    getItemId,
    isField,
    type AndFilterGroup,
    type ApiError,
    type FieldValueSearchResult,
    type FilterableItem,
    type ParametersValuesMap,
} from '@lightdash/common';
import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounce } from 'react-use';

import { lightdashApi } from '../api';
import useEmbed from '../ee/providers/Embed/useEmbed';
import {
    enqueueFieldSearch,
    isSupersededFieldSearchError,
} from '../utils/fieldSearchQueue';

export const MAX_AUTOCOMPLETE_RESULTS = 50;

/**
 * Upper bound on how many candidates the "Add all" action will pull in
 * one go. The dropdown itself only renders MAX_AUTOCOMPLETE_RESULTS at a
 * time, but clicking "Add all" may fetch up to this many from the
 * warehouse so the user can pick every value that matches their search.
 */
export const MAX_SELECT_ALL_LIMIT = 500;

// 6-digit values are treated as YYYYMM cycles and sorted in descending order (newest first); other values keep the original localeCompare behavior.
const isYearMonthValue = (value: string) => /^\d{6}$/.test(value);

export const compareFieldValues = (a: string, b: string) => {
    if (isYearMonthValue(a) && isYearMonthValue(b)) {
        if (a === b) return 0;
        return a < b ? 1 : -1;
    }
    return a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' });
};

const getEmbedFilterValues = async (options: {
    embedToken: string;
    projectId: string;
    filterId: string;
    search: string;
    forceRefresh: boolean;
    filters: AndFilterGroup | undefined;
}) => {
    return lightdashApi<FieldValueSearchResult>({
        url: `/embed/${options.projectId}/filter/${options.filterId}/search`,
        method: 'POST',
        body: JSON.stringify({
            search: options.search,
            limit: MAX_SELECT_ALL_LIMIT,
            filters: options.filters,
            forceRefresh: options.forceRefresh,
        }),
    });
};

type DashboardFilterContext = {
    dashboardSlug?: string;
    dashboardName?: string;
    /** Dashboard uuid is globally unique, the slug is only unique per project */
    dashboardUuid?: string;
};

export const getFieldValues = async (
    projectId: string,
    table: string | undefined,
    fieldId: string,
    search: string,
    forceRefresh: boolean,
    filters: AndFilterGroup | undefined,
    limit: number = MAX_SELECT_ALL_LIMIT,
    parameterValues?: ParametersValuesMap,
    dashboardContext?: DashboardFilterContext,
) => {
    if (!table) {
        throw new Error('Table is required to search for field values');
    }

    /**
     * field/search 是重查询（带 dbt sql_filter + GROUP BY），
     * 仓库引擎的内存限额是所有 query 合计的全局限额：
     * 并发跑会打满引擎内存（HGERR_code 53200），
     * 连带把看板查询和类目联动一起拒绝。
     *
     * 因此自动补全也走类目解析用的同一条串行队列。
     * 同一个字段的新搜索词会让排队中的旧请求直接作废（避免排一堆用不上的重查询）。
     */
    return enqueueFieldSearch(
        () =>
            lightdashApi<FieldValueSearchResult>({
                url: `/projects/${projectId}/field/${fieldId}/search`,
                method: 'POST',
                body: JSON.stringify({
                    search,
                    limit,
                    table,
                    filters,
                    forceRefresh,
                    parameters: parameterValues,
                    dashboardSlug: dashboardContext?.dashboardSlug,
                    dashboardName: dashboardContext?.dashboardName,
                    dashboardUuid: dashboardContext?.dashboardUuid,
                }),
            }),
        {
            // 同一个字段：新搜索词作废排队中的旧请求
            key: `autocomplete:${projectId}:${fieldId}`,
            // 同一个搜索词：视为重复请求，不互相作废
            dedupeKey: `autocomplete:${projectId}:${fieldId}:${search}:${String(
                forceRefresh,
            )}`,
        },
    );
};

export const useFieldValues = (
    search: string,
    initialData: string[],
    projectId: string | undefined,
    field: FilterableItem,
    filterId: string | undefined,
    filters: AndFilterGroup | undefined,
    debounce: boolean = true,
    forceRefresh: boolean = false,
    useQueryOptions?: UseQueryOptions<FieldValueSearchResult, ApiError>,
    parameterValues?: ParametersValuesMap,
    dashboardContext?: DashboardFilterContext,
) => {
    const { embedToken } = useEmbed();
    const [fieldName, setFieldName] = useState<string>(field.name);
    const [debouncedSearch, setDebouncedSearch] = useState<string>(search);
    const [searches, setSearches] = useState(new Set<string>());
    const [results, setResults] = useState(
        () => new Set([...initialData].sort(compareFieldValues)),
    );
    const [resultCounts, setResultCounts] = useState<Map<string, number>>(
        new Map(),
    );
    const [refreshedAt, setRefreshedAt] = useState<Date>(new Date());

    const tableName = useMemo(
        () => (isField(field) ? field.table : undefined),
        [field],
    );

    const fieldId = useMemo(() => getItemId(field), [field]);

    const handleUpdateResults = useCallback(
        (data: FieldValueSearchResult<string>) => {
            if (getFilterRulesFromGroup(filters).length > 0) {
                setSearches(new Set<string>());
                setResults(new Set(initialData));
                setResultCounts(new Map());
            }
            setRefreshedAt(new Date(data.refreshedAt));
            setSearches((s) => {
                return s.add(data.search);
            });

            setResultCounts((map) => {
                return map.set(data.search, data.results.length);
            });

            setResults((oldSet) => {
                return new Set(
                    [...oldSet, ...data.results].sort(compareFieldValues),
                );
            });
        },
        [filters, initialData],
    );
    const cachekey = [
        'project',
        projectId,
        tableName,
        fieldName,
        'search',
        debouncedSearch,
        parameterValues,
    ];
    const query = useQuery<FieldValueSearchResult, ApiError>(
        cachekey,
        () => {
            if (embedToken && filterId && projectId) {
                return getEmbedFilterValues({
                    embedToken,
                    projectId,
                    filterId,
                    search: debouncedSearch,
                    forceRefresh,
                    filters,
                });
            } else {
                return getFieldValues(
                    projectId!,
                    tableName,
                    fieldId,
                    debouncedSearch,
                    forceRefresh,
                    filters,
                    undefined,
                    parameterValues,
                    dashboardContext,
                ).catch((error: unknown) => {
                    if (isSupersededFieldSearchError(error)) {
                        // 被更新的搜索词取代：不再 settle，
                        // 避免把旧的（空）结果写进下拉框
                        return new Promise<FieldValueSearchResult>(() => {});
                    }
                    throw error;
                });
            }
        },
        {
            // make sure we don't cache for too long
            cacheTime: 60 * 1000, // 1 minute
            ...useQueryOptions,
            enabled: !!tableName && !!projectId,
            staleTime: 0,
            onSuccess: (data) => {
                const { results: newResults, search: newSearch } = data;

                const normalizedNewResults = newResults.filter(
                    (result): result is string => typeof result === 'string',
                );

                const normalizedData = {
                    search: newSearch,
                    results: normalizedNewResults,
                    cached: data.cached,
                    refreshedAt: data.refreshedAt,
                };

                handleUpdateResults(normalizedData);

                useQueryOptions?.onSuccess?.(normalizedData);
            },
        },
    );

    useDebounce(
        () => setDebouncedSearch(search),
        !debounce || searches.has(search) ? 0 : 500,
        [search],
    );

    // reset state when field changes
    useEffect(() => {
        if (!!fieldName && field.name !== fieldName) {
            setFieldName(field.name);
            setSearches(new Set<string>());
            setResults(new Set(initialData));
            setResultCounts(new Map());
        }
    }, [initialData, fieldName, field.name, forceRefresh]);

    return {
        ...query,
        debouncedSearch,
        searches,
        results,
        resultCounts,
        refreshedAt,
    };
};

// Wrapper hook that returns undefined for all values when field is undefined
export const useFieldValuesSafely = (
    search: string,
    initialData: string[],
    projectId: string | undefined,
    field: FilterableItem | undefined,
    filterId: string | undefined,
    filters: AndFilterGroup | undefined,
    debounce: boolean = true,
    forceRefresh: boolean = false,
    useQueryOptions?: UseQueryOptions<FieldValueSearchResult, ApiError>,
    parameterValues?: ParametersValuesMap,
) => {
    const fieldValuesResult = useFieldValues(
        search,
        initialData,
        projectId || '',
        field || {
            name: '',
            table: '',
            fieldType: 'dimension' as any,
            type: 'string' as any,
            label: '',
            tableLabel: '',
            sql: '',
            hidden: false,
        },
        filterId,
        filters,
        debounce,
        forceRefresh,
        {
            ...useQueryOptions,
            enabled: !!field && useQueryOptions?.enabled !== false,
        },
        parameterValues,
    );

    if (!field) {
        return {
            data: undefined,
            error: undefined,
            isLoading: undefined,
            isInitialLoading: undefined,
            isError: undefined,
            isSuccess: undefined,
            status: undefined,
            dataUpdatedAt: undefined,
            errorUpdatedAt: undefined,
            failureCount: undefined,
            failureReason: undefined,
            fetchStatus: undefined,
            isStale: undefined,
            isFetched: undefined,
            isFetchedAfterMount: undefined,
            isRefetching: undefined,
            isLoadingError: undefined,
            isRefetchError: undefined,
            refetch: undefined,
            remove: undefined,
            debouncedSearch: undefined,
            searches: undefined,
            results: undefined,
            resultCounts: undefined,
            refreshedAt: undefined,
        };
    }

    return fieldValuesResult;
};
