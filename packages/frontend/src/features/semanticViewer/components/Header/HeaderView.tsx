import { subject } from '@casl/ability';
import {
    DashboardTileTypes,
    type SavedSemanticViewerChart,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconDots, IconLayoutGridAdd, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { TitleBreadCrumbs } from '../../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import AddTilesToDashboardModal from '../../../../components/SavedDashboards/AddTilesToDashboardModal';
import MantineIcon from '../../../../components/common/MantineIcon';
import { UpdatedInfo } from '../../../../components/common/PageHeader/UpdatedInfo';
import { ResourceInfoPopup } from '../../../../components/common/ResourceInfoPopup/ResourceInfoPopup';
import useApp from '../../../../providers/App/useApp';
import DeleteSemanticViewerChartModal from '../Modals/DeleteSemanticViewerChartModal';

type Props = {
    projectUuid: string;
    savedSemanticViewerChart: SavedSemanticViewerChart;
};

export const HeaderView: FC<Props> = ({
    projectUuid,
    savedSemanticViewerChart: chart,
}) => {
    const navigate = useNavigate();
    const { user } = useApp();
    const { t } = useTranslation();

    const [
        isDeleteModalOpen,
        { open: openDeleteModal, close: closeDeleteModal },
    ] = useDisclosure(false);
    const [
        isAddToDashboardOpen,
        { open: openAddToDashboardModal, close: closeAddToDashboardModal },
    ] = useDisclosure(false);

    const savedChartSpaceUserAccess = chart.space.userAccess
        ? [chart.space.userAccess]
        : [];

    const canManageChart = user.data?.ability?.can(
        'manage',
        subject('SavedChart', {
            organizationUuid: user.data?.organizationUuid,
            projectUuid,
            isPrivate: chart.space.isPrivate,
            access: savedChartSpaceUserAccess,
        }),
    );

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="xs" withBorder>
                <Group position="apart">
                    <Stack spacing="none">
                        <Group spacing="two">
                            <TitleBreadCrumbs
                                projectUuid={projectUuid}
                                spaceUuid={chart.space.uuid}
                                spaceName={chart.space.name}
                            />
                            <Title c="dark.6" order={5} fw={600}>
                                {chart.name}
                            </Title>
                        </Group>
                        <Group spacing="xs">
                            <UpdatedInfo
                                updatedAt={chart.lastUpdatedAt}
                                user={chart.lastUpdatedBy}
                                partiallyBold={false}
                            />
                            <ResourceInfoPopup
                                resourceUuid={
                                    chart.savedSemanticViewerChartUuid
                                }
                                projectUuid={projectUuid}
                                description={chart.description ?? undefined}
                                viewStats={chart.views}
                                firstViewedAt={chart.firstViewedAt}
                                withChartData={false}
                            />
                        </Group>
                    </Stack>

                    <Group spacing="md">
                        {canManageChart && (
                            <Button
                                size="xs"
                                variant="default"
                                onClick={() =>
                                    navigate(
                                        `/projects/${projectUuid}/semantic-viewer/${chart.slug}/edit`,
                                    )
                                }
                            >
                                {t(
                                    'features_semantic_viewer_header.edit_chart',
                                )}
                            </Button>
                        )}

                        <Menu
                            position="bottom"
                            withArrow
                            withinPortal
                            shadow="md"
                            width={200}
                        >
                            <Menu.Target>
                                <ActionIcon variant="default">
                                    <MantineIcon icon={IconDots} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                <Menu.Label>
                                    {t(
                                        'features_semantic_viewer_header.manage',
                                    )}
                                </Menu.Label>
                                <Menu.Item
                                    icon={
                                        <MantineIcon icon={IconLayoutGridAdd} />
                                    }
                                    onClick={openAddToDashboardModal}
                                >
                                    {t(
                                        'features_semantic_viewer_header.add_to_dashboard',
                                    )}
                                </Menu.Item>
                                <Menu.Item
                                    icon={
                                        <MantineIcon
                                            icon={IconTrash}
                                            color="red"
                                        />
                                    }
                                    color="red"
                                    disabled={!canManageChart}
                                    onClick={openDeleteModal}
                                >
                                    {t(
                                        'features_semantic_viewer_header.delete',
                                    )}
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </Group>
                </Group>
            </Paper>

            <DeleteSemanticViewerChartModal
                projectUuid={projectUuid}
                uuid={chart.savedSemanticViewerChartUuid}
                name={chart.name}
                opened={isDeleteModalOpen}
                onClose={closeDeleteModal}
                onSuccess={() => navigate(`/projects/${projectUuid}/home`)}
            />

            <AddTilesToDashboardModal
                isOpen={isAddToDashboardOpen}
                projectUuid={projectUuid}
                uuid={chart.savedSemanticViewerChartUuid}
                dashboardTileType={DashboardTileTypes.SEMANTIC_VIEWER_CHART}
                onClose={closeAddToDashboardModal}
            />
        </>
    );
};
