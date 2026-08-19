import {
    Group,
    NumberInput,
    Pagination,
    Text,
    type GroupProps,
} from '@mantine/core';
import {
    IconChevronLeft,
    IconChevronRight,
    IconChevronsLeft,
    IconChevronsRight,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

type PaginateControlProps = GroupProps & {
    currentPage: number;
    totalPages: number;
    onPreviousPage: () => void;
    hasPreviousPage: boolean;
    onNextPage: () => void;
    hasNextPage: boolean;
    /** 1-based page index */
    onPageChange?: (page: number) => void;
};

const PaginateControl: FC<PaginateControlProps> = ({
    currentPage,
    totalPages,
    onPreviousPage,
    hasPreviousPage,
    onNextPage,
    hasNextPage,
    onPageChange,
    ...rest
}) => {
    const { t } = useTranslation();
    const safeTotalPages = Math.max(1, totalPages);
    const [draftPage, setDraftPage] = useState<number | ''>(currentPage);

    useEffect(() => {
        setDraftPage(currentPage);
    }, [currentPage]);

    const goToPage = (page: number) => {
        if (!onPageChange) {
            return;
        }
        const next = Math.min(Math.max(1, Math.round(page)), safeTotalPages);
        setDraftPage(next);
        if (next !== currentPage) {
            onPageChange(next);
        }
    };

    const commitDraft = () => {
        if (draftPage === '') {
            setDraftPage(currentPage);
            return;
        }
        goToPage(draftPage);
    };

    return (
        <Group noWrap spacing="xs" align="center" {...rest}>
            <Text color="gray.7" size="xs" sx={{ whiteSpace: 'nowrap' }}>
                {t('components_common_paginate.page')}
            </Text>
            {onPageChange ? (
                <NumberInput
                    size="xs"
                    w={72}
                    min={1}
                    max={safeTotalPages}
                    hideControls
                    value={draftPage}
                    onChange={(value) => {
                        setDraftPage(typeof value === 'number' ? value : '');
                    }}
                    onBlur={commitDraft}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            commitDraft();
                        }
                    }}
                    aria-label={t('components_common_paginate.jump_to_page')}
                />
            ) : (
                <Text span fw={600} color="black" size="xs">
                    {currentPage}
                </Text>
            )}
            <Text color="gray.7" size="xs" sx={{ whiteSpace: 'nowrap' }}>
                {t('components_common_paginate.of')}{' '}
                <Text span fw={600} color="black">
                    {safeTotalPages}
                </Text>
            </Text>

            <Pagination.Root
                total={safeTotalPages}
                onNextPage={onNextPage}
                onPreviousPage={onPreviousPage}
            >
                <Group spacing={4} noWrap position="center">
                    {onPageChange ? (
                        <Pagination.First
                            icon={IconChevronsLeft}
                            disabled={!hasPreviousPage}
                            onClick={() => goToPage(1)}
                            aria-label={t('components_common_paginate.first')}
                        />
                    ) : null}
                    <Pagination.Previous
                        icon={IconChevronLeft}
                        disabled={!hasPreviousPage}
                    />
                    <Pagination.Next
                        icon={IconChevronRight}
                        disabled={!hasNextPage}
                    />
                    {onPageChange ? (
                        <Pagination.Last
                            icon={IconChevronsRight}
                            disabled={!hasNextPage}
                            onClick={() => goToPage(safeTotalPages)}
                            aria-label={t('components_common_paginate.last')}
                        />
                    ) : null}
                </Group>
            </Pagination.Root>
        </Group>
    );
};

export default PaginateControl;
