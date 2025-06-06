import { subject } from '@casl/ability';
import {
    assertUnreachable,
    ContentType,
    type SummaryContent,
} from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Modal,
    MultiSelect,
    ScrollArea,
    Stack,
    Text,
    Title,
    type ModalProps,
    type ScrollAreaProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useDebouncedValue } from '@mantine/hooks';
import { IconFolder } from '@tabler/icons-react';
import { uniqBy } from 'lodash';
import React, {
    forwardRef,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useUpdateMultipleDashboard } from '../../../hooks/dashboard/useDashboards';
import { useInfiniteContent } from '../../../hooks/useContent';
import { useUpdateMultipleMutation } from '../../../hooks/useSavedQuery';
import { useSpace, useSpaceSummaries } from '../../../hooks/useSpaces';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { AddToSpaceResources } from './types';

type SelectItemData = {
    value: string;
    label: string;
    disabled: boolean;
    title: string;
    spaceName: string | undefined;
};

const SelectItem = forwardRef<HTMLDivElement, SelectItemData>(
    (
        {
            label,
            value,
            spaceName,
            ...others
        }: React.ComponentPropsWithoutRef<'div'> & SelectItemData,
        ref,
    ) => (
        <Stack ref={ref} {...others} spacing="two">
            <Text fz="sm" fw={500}>
                {label}
            </Text>
            <Group spacing="xs">
                <MantineIcon size="sm" icon={IconFolder} />
                <Text fz="xs" opacity={0.65}>
                    {spaceName}
                </Text>
            </Group>
        </Stack>
    ),
);

type AddItemForm = {
    items: string[];
};

type Props = Pick<ModalProps, 'onClose'> & {
    resourceType: AddToSpaceResources;
};

const AddResourceToSpaceModal: FC<Props> = ({ resourceType, onClose }) => {
    const { t } = useTranslation();

    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();
    const { user } = useApp();
    const { data: space } = useSpace(projectUuid, spaceUuid);
    const { data: spaces } = useSpaceSummaries(projectUuid);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [debouncedSearchQuery] = useDebouncedValue(searchQuery, 300);
    const selectScrollRef = useRef<HTMLDivElement>(null);
    const {
        data: contentPages,
        isInitialLoading,
        isFetching,
        hasNextPage,
        fetchNextPage,
    } = useInfiniteContent(
        {
            projectUuids: [projectUuid!],
            contentTypes:
                resourceType === AddToSpaceResources.CHART
                    ? [ContentType.CHART]
                    : [ContentType.DASHBOARD],
            page: 1,
            pageSize: 25,
            search: debouncedSearchQuery,
        },
        { keepPreviousData: true },
    );
    useEffect(() => {
        selectScrollRef.current?.scrollTo({
            top: selectScrollRef.current?.scrollHeight,
        });
    }, [contentPages]);
    // Aggregates all fetched charts/dashboards across pages and search queries into a unified list.
    // This ensures that previously fetched charts/dashboards are preserved even when the search query changes.
    // Uses 'uuid' to remove duplicates and maintain a consistent set of unique charts/dashboards.
    const [allItems, setAllItems] = useState<SummaryContent[]>([]);
    useEffect(() => {
        const allPages = contentPages?.pages.map((p) => p.data).flat() ?? [];
        const itemsWithUpdatePermission = allPages.filter((summary) => {
            const summarySpace = spaces?.find(
                ({ uuid }) => uuid === summary.space.uuid,
            );
            return user.data?.ability.can(
                'update',
                subject(
                    resourceType === AddToSpaceResources.CHART
                        ? 'SavedChart'
                        : 'Dashboard',
                    {
                        ...summarySpace,
                        access: summarySpace?.userAccess
                            ? [summarySpace?.userAccess]
                            : [],
                    },
                ),
            );
        });

        setAllItems((previousState) =>
            uniqBy([...previousState, ...itemsWithUpdatePermission], 'uuid'),
        );
    }, [contentPages?.pages, user.data, spaces, resourceType]);

    const { mutate: chartMutation } = useUpdateMultipleMutation(projectUuid!);
    const { mutate: dashboardMutation } = useUpdateMultipleDashboard(
        projectUuid!,
    );

    const form = useForm<AddItemForm>();
    const { reset } = form;

    const closeModal = useCallback(() => {
        reset();
        if (onClose) onClose();
    }, [reset, onClose]);

    const getResourceTypeLabel = useCallback(
        (type: AddToSpaceResources) => {
            switch (type) {
                case AddToSpaceResources.DASHBOARD:
                    return t('components_explorer_space_browser.dashboard');
                case AddToSpaceResources.CHART:
                    return t('components_explorer_space_browser.chart');
                default:
                    return assertUnreachable(
                        type,
                        'Unexpected resource type when getting label',
                    );
            }
        },
        [t],
    );

    const selectItems: SelectItemData[] = useMemo(() => {
        return allItems.map<SelectItemData>(
            ({
                uuid: itemUuid,
                name,
                space: { uuid: itemSpaceUuid, name: itemSpaceName },
            }) => {
                const disabled = spaceUuid === itemSpaceUuid;
                return {
                    value: itemUuid,
                    label: name,
                    disabled,
                    title: disabled
                        ? `${getResourceTypeLabel(resourceType)} ${t(
                              'components_explorer_space_browser.add_modal.added',
                          )} ${itemSpaceName}`
                        : '',
                    spaceName: itemSpaceName,
                };
            },
        );
    }, [spaceUuid, allItems, resourceType, getResourceTypeLabel, t]);

    const handleSubmit = form.onSubmit(({ items }) => {
        if (!spaceUuid) return;
        switch (resourceType) {
            case AddToSpaceResources.CHART:
                if (items) {
                    const selectedCharts = items.map((item) => {
                        const chart = allItems.find(
                            (savedChart) => savedChart.uuid === item,
                        );
                        return {
                            uuid: item,
                            name: chart?.name || '',
                            spaceUuid,
                        };
                    });

                    chartMutation(selectedCharts);
                }
                break;
            case AddToSpaceResources.DASHBOARD:
                if (items) {
                    const selectedDashboards = items.map((item) => {
                        const dashboard = allItems.find(
                            ({ uuid }) => uuid === item,
                        );
                        return {
                            uuid: item,
                            name: dashboard?.name || '',
                            spaceUuid,
                        };
                    });

                    dashboardMutation(selectedDashboards);
                }
                break;
        }

        closeModal();
    });

    return (
        <Modal
            opened
            onClose={closeModal}
            title={
                <Title order={4}>
                    {t('components_explorer_space_browser.add_modal.title', {
                        resourceType: getResourceTypeLabel(resourceType),
                    })}
                </Title>
            }
        >
            <form name="add_items_to_space" onSubmit={handleSubmit}>
                <Stack spacing="xs" pt="sm">
                    <Text>
                        {t(
                            'components_explorer_space_browser.add_modal.content',
                            {
                                resourceType:
                                    getResourceTypeLabel(resourceType),
                            },
                        )}
                        <Text span fw={500}>
                            {space?.name}
                        </Text>
                        :
                    </Text>

                    <MultiSelect
                        withinPortal
                        searchable
                        required
                        data={selectItems}
                        itemComponent={SelectItem}
                        disabled={isInitialLoading}
                        placeholder={t(
                            'components_explorer_space_browser.add_modal.search',
                            {
                                resourceType,
                            },
                        )}
                        nothingFound={t(
                            'components_explorer_space_browser.add_modal.nothing_found',
                            {
                                resourceType,
                            },
                        )}
                        clearable
                        searchValue={searchQuery}
                        onSearchChange={setSearchQuery}
                        maxDropdownHeight={300}
                        rightSection={
                            isFetching && <Loader size="xs" color="gray" />
                        }
                        dropdownComponent={({
                            children,
                            ...rest
                        }: ScrollAreaProps) => (
                            <ScrollArea {...rest} viewportRef={selectScrollRef}>
                                <>
                                    {children}
                                    {hasNextPage && (
                                        <Button
                                            size="xs"
                                            variant="white"
                                            onClick={async () => {
                                                await fetchNextPage();
                                            }}
                                            disabled={isFetching}
                                        >
                                            <Text>
                                                {t(
                                                    'components_explorer_space_browser.add_modal.load_more',
                                                )}
                                            </Text>
                                        </Button>
                                    )}
                                </>
                            </ScrollArea>
                        )}
                        {...form.getInputProps('items')}
                    />
                </Stack>

                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={closeModal}>
                        {t(
                            'components_explorer_space_browser.add_modal.cancel',
                        )}
                    </Button>
                    <Button disabled={isInitialLoading} type="submit">
                        {t('components_explorer_space_browser.add_modal.move', {
                            resourceType,
                        })}
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};

export default AddResourceToSpaceModal;
