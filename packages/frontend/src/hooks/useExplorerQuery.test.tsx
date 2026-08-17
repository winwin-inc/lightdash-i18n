import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { explorerStore } from '../features/explorer/store';
import ExplorerProvider from '../providers/Explorer/ExplorerProvider';
import { useExplorerQuery } from './useExplorerQuery';

const { mockExecuteQueryAndWaitForResults, mockUseFeatureFlag } = vi.hoisted(
    () => ({
        mockExecuteQueryAndWaitForResults: vi.fn(),
        mockUseFeatureFlag: vi.fn(() => ({ data: { enabled: false } })),
    }),
);

// Mock the hooks that depend on external APIs
vi.mock('./useExplore', () => ({
    useExplore: vi.fn(() => ({ data: null })),
}));

vi.mock('./useFeatureFlagEnabled', () => ({
    useFeatureFlag: mockUseFeatureFlag,
}));

vi.mock('./parameters/useParameters', () => ({
    useParameters: vi.fn(() => ({ data: {} })),
}));

vi.mock('../providers/Explorer/useQueryExecutor', () => ({
    useQueryExecutor: vi.fn(() => [
        {
            query: { isFetched: false, isFetching: false },
            queryResults: {
                queryUuid: null,
                totalResults: 0,
                isFetchingFirstPage: false,
                isFetchingAllPages: false,
                error: null,
            },
        },
        vi.fn(),
    ]),
}));

vi.mock('./useQueryResults', () => ({
    executeQueryAndWaitForResults: mockExecuteQueryAndWaitForResults,
    useCancelQuery: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('./useExplorerQueryManager', () => ({
    useExplorerQueryManager: vi.fn(() => ({
        projectUuid: 'project-uuid',
        query: { isFetched: true, isFetching: false },
        queryResults: {
            queryUuid: 'table-query-uuid',
            totalResults: 25,
            isFetchingFirstPage: false,
            isFetchingAllPages: false,
            error: null,
        },
        unpivotedQueryResults: {
            queryUuid: 'unpivoted-query-uuid',
            totalResults: 25,
            isFetchingFirstPage: false,
            isFetchingAllPages: false,
            error: null,
        },
        validQueryArgs: {
            projectUuid: 'project-uuid',
            tableId: 'explore',
            query: {
                exploreName: 'explore',
                dimensions: [],
                metrics: [],
                filters: {},
                sorts: [],
                limit: 25,
                tableCalculations: [],
                additionalMetrics: [],
            },
            pivotConfiguration: {
                indexColumn: { reference: 'dim_a' },
                valuesColumns: [
                    { reference: 'metric_a', aggregation: 'sum' },
                ],
                groupByColumns: [{ reference: 'dim_b' }],
                sortBy: undefined,
            },
        },
        runQuery: vi.fn(),
        isLoading: false,
        activeFields: new Set(),
    })),
}));

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>
            <Provider store={explorerStore}>
                <MemoryRouter>
                    <ExplorerProvider>{children}</ExplorerProvider>
                </MemoryRouter>
            </Provider>
        </QueryClientProvider>
    );
};

describe('useExplorerQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockUseFeatureFlag.mockReturnValue({ data: { enabled: false } });
        mockExecuteQueryAndWaitForResults.mockResolvedValue({
            queryUuid: 'download-query-uuid',
        });
    });

    it('should return query state and actions', () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        expect(result.current).toHaveProperty('query');
        expect(result.current).toHaveProperty('queryResults');
        expect(result.current).toHaveProperty('isLoading');
        expect(result.current).toHaveProperty('runQuery');
        expect(result.current).toHaveProperty('resetQueryResults');
        expect(result.current).toHaveProperty('getDownloadQueryUuid');
        expect(result.current).toHaveProperty('activeFields');
    });

    it('should clear pivotConfiguration when downloading unpivoted all results', async () => {
        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        await act(async () => {
            // ResultsCard always requests unpivoted downloads (second arg false)
            await result.current.getDownloadQueryUuid(null, false);
        });

        expect(mockExecuteQueryAndWaitForResults).toHaveBeenCalledWith(
            expect.objectContaining({
                csvLimit: null,
                pivotResults: false,
                pivotConfiguration: undefined,
            }),
        );
    });

    it('should keep pivotConfiguration when downloading pivoted results and flag is on', async () => {
        mockUseFeatureFlag.mockReturnValue({ data: { enabled: true } });

        const { result } = renderHook(() => useExplorerQuery(), {
            wrapper: createWrapper(),
        });

        await act(async () => {
            await result.current.getDownloadQueryUuid(null, true);
        });

        expect(mockExecuteQueryAndWaitForResults).toHaveBeenCalledWith(
            expect.objectContaining({
                csvLimit: null,
                pivotResults: true,
                pivotConfiguration: expect.objectContaining({
                    indexColumn: { reference: 'dim_a' },
                }),
            }),
        );
    });
});
