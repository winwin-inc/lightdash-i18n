import {
    assertUnreachable,
    type ApiContentActionBody,
    type ApiContentBulkActionBody,
    type ApiContentResponse,
    type ApiError,
    type ApiSuccessEmpty,
    type ContentSortByColumns,
    type ContentType,
} from '@lightdash/common';
import { IconArrowRight } from '@tabler/icons-react';
import {
    useInfiniteQuery,
    useMutation,
    useQueryClient,
    type QueryClient,
    type UseInfiniteQueryOptions,
    type UseMutationOptions,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

export type ContentArgs = {
    projectUuids: string[];
    spaceUuids?: string[];
    contentTypes?: ContentType[];
    pageSize?: number;
    page?: number;
    search?: string;
    sortBy?: ContentSortByColumns;
    sortDirection?: 'asc' | 'desc';
};

function createQueryString(params: Record<string, any>): string {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(params)) {
        if (Array.isArray(value)) {
            value.forEach((v) => query.append(key, v));
        } else if (value !== undefined) {
            query.append(key, value.toString());
        }
    }
    return query.toString();
}
const getContent = async (args: ContentArgs) => {
    const params = createQueryString(args);
    return lightdashApi<ApiContentResponse['results']>({
        version: 'v2',
        url: `/content?${params}`,
        method: 'GET',
        body: undefined,
    });
};

export const useInfiniteContent = (
    args: ContentArgs,
    infinityQueryOpts: UseInfiniteQueryOptions<
        ApiContentResponse['results'],
        ApiError
    > = {},
) => {
    return useInfiniteQuery<ApiContentResponse['results'], ApiError>({
        queryKey: ['content', args],
        queryFn: async ({ pageParam }) => {
            return getContent({
                ...args,
                page: pageParam ?? 1,
            });
        },
        getNextPageParam: (lastPage) => {
            if (lastPage.pagination) {
                return lastPage.pagination.page <
                    lastPage.pagination.totalPageCount
                    ? lastPage.pagination.page + 1
                    : undefined;
            }
        },
        ...infinityQueryOpts,
    });
};

const postContentAction = async ({
    projectUuid,
    body,
}: {
    projectUuid: string;
    body: ApiContentActionBody;
}) => {
    return lightdashApi<ApiSuccessEmpty>({
        version: 'v2',
        url: `/content/${projectUuid}/${body.action.type}`,
        method: 'POST',
        body: JSON.stringify(body),
    });
};

const postContentBulkAction = async ({
    projectUuid,
    body,
}: {
    projectUuid: string;
    body: ApiContentBulkActionBody;
}) => {
    return lightdashApi<ApiSuccessEmpty>({
        version: 'v2',
        url: `/content/bulk-action/${projectUuid}/${body.action.type}`,
        method: 'POST',
        body: JSON.stringify(body),
    });
};

const invalidateContent = async (
    queryClient: QueryClient,
    projectUuid: string,
) => {
    await Promise.all([
        queryClient.invalidateQueries(['content']),
        queryClient.invalidateQueries(['dashboards']),
        queryClient.invalidateQueries(['most-popular-and-recently-updated']),
        queryClient.invalidateQueries(['pinned_items']),
        queryClient.invalidateQueries(['projects', projectUuid, 'spaces']),
        queryClient.invalidateQueries(['space', projectUuid]),
        queryClient.invalidateQueries(['space']),
        queryClient.invalidateQueries(['spaces']),
    ]);
};

export const useContentAction = (
    projectUuid: string | undefined,
    options?: UseMutationOptions<
        ApiSuccessEmpty,
        ApiError,
        ApiContentActionBody
    >,
) => {
    const { t } = useTranslation();

    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return useMutation<ApiSuccessEmpty, ApiError, ApiContentActionBody>({
        mutationFn: (body) => {
            if (!projectUuid) {
                throw new Error(t('hooks_content.project_uuid_required'));
            }

            return postContentAction({
                projectUuid,
                body,
            });
        },
        ...options,
        onSuccess: async (data, variables, context) => {
            if (!projectUuid) {
                throw new Error(t('hooks_content.project_uuid_required'));
            }

            await invalidateContent(queryClient, projectUuid);

            options?.onSuccess?.(data, variables, context);

            const { item, action } = variables;

            switch (action.type) {
                case 'move':
                    return showToastSuccess({
                        title: t('hooks_content.move_success', {
                            contentType: variables.item.contentType,
                        }),
                        action: {
                            children: t('hooks_content.go_to_space'),
                            icon: IconArrowRight,
                            onClick: () =>
                                navigate(
                                    action.targetSpaceUuid
                                        ? `/projects/${projectUuid}/spaces/${action.targetSpaceUuid}`
                                        : `/projects/${projectUuid}/spaces`,
                                ),
                        },
                    });

                case 'delete':
                    return showToastSuccess({
                        title: t('hooks_content.delete_success', {
                            contentType: item.contentType,
                        }),
                    });

                default:
                    return assertUnreachable(
                        action,
                        t('hooks_content.invalid_action_type'),
                    );
            }
        },
        onError: (error, variables, context) => {
            showToastApiError({
                title: t('hooks_content.move_content_error'),
                apiError: error.error,
            });

            options?.onError?.(error, variables, context);
        },
    });
};

export const useContentBulkAction = (
    projectUuid: string | undefined,
    options?: UseMutationOptions<
        ApiSuccessEmpty,
        ApiError,
        ApiContentBulkActionBody
    >,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { t } = useTranslation();

    return useMutation<ApiSuccessEmpty, ApiError, ApiContentBulkActionBody>({
        mutationFn: (body) => {
            if (!projectUuid) {
                throw new Error(t('hooks_content.project_uuid_required'));
            }
            return postContentBulkAction({
                projectUuid,
                body,
            });
        },
        onSuccess: async (data, variables, context) => {
            if (!projectUuid) {
                throw new Error(t('hooks_content.project_uuid_required'));
            }

            await invalidateContent(queryClient, projectUuid);

            options?.onSuccess?.(data, variables, context);

            const { content, action } = variables;

            switch (action.type) {
                case 'move':
                    return showToastSuccess({
                        title: t('hooks_content.move_item.success', {
                            contentType:
                                content.length === 1
                                    ? t('hooks_content.move_item.item')
                                    : t('hooks_content.move_item.items'),
                        }),
                        action: {
                            children: t('hooks_content.move_item.go_to_space'),
                            icon: IconArrowRight,
                            onClick: () =>
                                navigate(
                                    action.targetSpaceUuid
                                        ? `/projects/${projectUuid}/spaces/${action.targetSpaceUuid}`
                                        : `/projects/${projectUuid}/spaces`,
                                ),
                        },
                    });

                case 'delete':
                    return showToastSuccess({
                        title: t('hooks_content.delete_item.success', {
                            contentType:
                                content.length === 1
                                    ? t('hooks_content.delete_item.item')
                                    : t('hooks_content.delete_item.items'),
                        }),
                    });

                default:
                    return assertUnreachable(
                        action,
                        t('hooks_content.invalid_action_type'),
                    );
            }
        },
        onError: (error, variables, context) => {
            showToastApiError({
                title: t('hooks_content.move_content_error'),
                apiError: error.error,
            });

            options?.onError?.(error, variables, context);
        },
    });
};
