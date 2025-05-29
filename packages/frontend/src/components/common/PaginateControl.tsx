import { Group, Pagination, Text, type GroupProps } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

type PaginateControlProps = GroupProps & {
    currentPage: number;
    totalPages: number;
    onPreviousPage: () => void;
    hasPreviousPage: boolean;
    onNextPage: () => void;
    hasNextPage: boolean;
};

const PaginateControl: FC<PaginateControlProps> = ({
    currentPage,
    totalPages,
    onPreviousPage,
    hasPreviousPage,
    onNextPage,
    hasNextPage,
    ...rest
}) => {
    const { t } = useTranslation();

    return (
        <Group {...rest}>
            <Text color="gray.7" size="xs">
                {t('components_common_paginate.page')}{' '}
                <Text span fw={600} color="black">
                    {currentPage}
                </Text>{' '}
                {t('components_common_paginate.of')}{' '}
                <Text span fw={600} color="black">
                    {totalPages}
                </Text>
            </Text>

            <Pagination.Root
                total={totalPages}
                onNextPage={onNextPage}
                onPreviousPage={onPreviousPage}
            >
                <Group spacing="xs" position="center">
                    <Pagination.Previous
                        icon={IconChevronLeft}
                        disabled={!hasPreviousPage}
                    />
                    <Pagination.Next
                        icon={IconChevronRight}
                        disabled={!hasNextPage}
                    />
                </Group>
            </Pagination.Root>
        </Group>
    );
};

export default PaginateControl;
