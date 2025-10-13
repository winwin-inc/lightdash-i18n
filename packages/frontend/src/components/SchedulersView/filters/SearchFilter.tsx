import { ActionIcon, TextInput, Tooltip } from '@mantine-8/core';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { type useLogsFilters } from '../../../features/scheduler/hooks/useLogsFilters';
import { type useSchedulerFilters } from '../../../features/scheduler/hooks/useSchedulerFilters';
import MantineIcon from '../../common/MantineIcon';
import classes from './SearchFilter.module.css';

type SearchFilterProps =
    | Pick<ReturnType<typeof useSchedulerFilters>, 'search' | 'setSearch'>
    | Pick<ReturnType<typeof useLogsFilters>, 'search' | 'setSearch'>;

export const SearchFilter = ({ search, setSearch }: SearchFilterProps) => {
    const { t } = useTranslation();

    return (
        <Tooltip
            withinPortal
            variant="xs"
            label={t(
                'components_schedulers_view_filters_search_filter.search_by_scheduler_name',
            )}
        >
            <TextInput
                size="xs"
                radius="md"
                classNames={{
                    input: search
                        ? classes.searchInputWithValue
                        : classes.searchInput,
                }}
                type="search"
                variant="default"
                placeholder={t(
                    'components_schedulers_view_filters_search_filter.search_by_scheduler_name_placeholder',
                )}
                value={search ?? ''}
                leftSection={
                    <MantineIcon size="md" color="gray.6" icon={IconSearch} />
                }
                onChange={(e) => setSearch(e.target.value)}
                rightSection={
                    search && (
                        <ActionIcon
                            onClick={() => setSearch('')}
                            variant="transparent"
                            size="xs"
                            color="gray.5"
                        >
                            <MantineIcon icon={IconX} />
                        </ActionIcon>
                    )
                }
                style={{ minWidth: 200, maxWidth: 350, flexShrink: 1 }}
            />
        </Tooltip>
    );
};
