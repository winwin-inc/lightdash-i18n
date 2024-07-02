import { subject } from '@casl/ability';
import { assertUnreachable } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    MultiSelect,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFolder } from '@tabler/icons-react';
import { forwardRef, useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import {
    useDashboards,
    useUpdateMultipleDashboard,
} from '../../../hooks/dashboard/useDashboards';
import { useChartSummaries } from '../../../hooks/useChartSummaries';
import { useUpdateMultipleMutation } from '../../../hooks/useSavedQuery';
import { useSpace, useSpaceSummaries } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

export enum AddToSpaceResources {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
}

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

    const getResourceTypeLabel = (type: AddToSpaceResources) => {
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
    };

    const { data: savedCharts, isLoading } = useChartSummaries(projectUuid, {
        select: (data) => {
            return data.filter((chart) => {
                const chartSpace = spaces?.find(
                    ({ uuid }) => uuid === chart.spaceUuid,
                );
                return user.data?.ability.can(
                    'update',
                    subject('SavedChart', {
                        ...chartSpace,
                        access: chartSpace?.userAccess
                            ? [chartSpace?.userAccess]
                            : [],
                    }),
                );
            });
        },
    });
    const { data: dashboards } = useDashboards(projectUuid, {
        select: (data) => {
            return data.filter((dashboard) => {
                const dashboardSpace = spaces?.find(
                    ({ uuid }) => uuid === dashboard.spaceUuid,
                );
                return user.data?.ability.can(
                    'update',
                    subject('Dashboard', {
                        ...dashboardSpace,
                        access: dashboardSpace?.userAccess
                            ? [dashboardSpace?.userAccess]
                            : [],
                    }),
                );
            });
        },
    });

    const { mutate: chartMutation } = useUpdateMultipleMutation(projectUuid);
    const { mutate: dashboardMutation } =
        useUpdateMultipleDashboard(projectUuid);

    const form = useForm<AddItemForm>();
    const { reset } = form;

    const closeModal = useCallback(() => {
        reset();
        if (onClose) onClose();
    }, [reset, onClose]);

    const allItems =
        resourceType === AddToSpaceResources.CHART ? savedCharts : dashboards;

    if (!allItems) {
        return null;
    }

    const selectItems: SelectItemData[] = allItems.map(
        ({ uuid: itemUuid, name, spaceUuid: itemSpaceUuid }) => {
            const disabled = spaceUuid === itemSpaceUuid;
            const spaceName = spaces?.find(
                (sp) => sp.uuid === itemSpaceUuid,
            )?.name;

            return {
                value: itemUuid,
                label: name,
                disabled,
                title: disabled
                    ? `${getResourceTypeLabel(resourceType)} ${t(
                          'components_explorer_space_browser.add_modal.added',
                      )} ${spaceName}`
                    : '',
                spaceName,
            };
        },
    );

    const handleSubmit = form.onSubmit(({ items }) => {
        switch (resourceType) {
            case AddToSpaceResources.CHART:
                if (savedCharts && items) {
                    const selectedCharts = items.map((item) => {
                        const chart = savedCharts.find(
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
                if (dashboards && items) {
                    const selectedDashboards = items.map((item) => {
                        const dashboard = dashboards.find(
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
                        disabled={isLoading}
                        placeholder={`Search for a ${resourceType}`}
                        {...form.getInputProps('items')}
                    />
                </Stack>

                <Group position="right" mt="sm">
                    <Button variant="outline" onClick={closeModal}>
                        {t(
                            'components_explorer_space_browser.add_modal.cancel',
                        )}
                    </Button>
                    <Button disabled={isLoading} type="submit">
                        {t('components_explorer_space_browser.add_modal.move', {
                            resourceType: getResourceTypeLabel(resourceType),
                        })}
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};

export default AddResourceToSpaceModal;
