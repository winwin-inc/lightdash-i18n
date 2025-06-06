import { subject } from '@casl/ability';
import {
    ProjectType,
    assertUnreachable,
    type OrganizationProject,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Center,
    Checkbox,
    Group,
    Stack,
    Table,
    Tabs,
    Text,
    Title,
} from '@mantine/core';
import { IconSettings, IconTrash } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router';

import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useTableTabStyles } from '../../../hooks/styles/useTableTabStyles';
import {
    useActiveProject,
    useUpdateActiveProjectMutation,
} from '../../../hooks/useActiveProject';
import { useProjects } from '../../../hooks/useProjects';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import { ProjectDeleteModal } from '../DeleteProjectPanel/DeleteProjectModal';
import { ProjectDeleteInBulkModal } from '../DeleteProjectPanel/ProjectDeleteInBulkModal';

type ProjectListItemProps = {
    project: OrganizationProject;
    isCurrentProject: boolean;
    isBulkActionActive: boolean;
    isSelected: boolean;
    onSelect: (isSelected: boolean) => void;
    onDelete: () => void;
};

const ProjectListItem: FC<ProjectListItemProps> = ({
    project,
    isCurrentProject,
    isBulkActionActive,
    isSelected,
    onSelect,
    onDelete,
}) => {
    const { user } = useApp();
    const navigate = useNavigate();

    const { mutateAsync: updateActiveProjectMutation } =
        useUpdateActiveProjectMutation();
    const { t } = useTranslation();

    const handleProjectSettingsClick = async () => {
        if (!isCurrentProject) {
            await updateActiveProjectMutation(project.projectUuid);
        }
        // a lot of cache invalidation happens after the mutation above
        // so we need to wait for the next event loop to navigate to the new project
        setTimeout(() => {
            void navigate(
                `/generalSettings/projectManagement/${project.projectUuid}/settings`,
                {
                    replace: true,
                },
            );
        }, 0);
    };

    return (
        <tr>
            <td width="1%">
                <Center>
                    <Checkbox
                        checked={isSelected}
                        disabled={user.data?.ability.cannot(
                            'delete',
                            subject('Project', {
                                type: project.type,
                                projectUuid: project.projectUuid,
                                organizationUuid: user.data?.organizationUuid,
                                createdByUserUuid: project.createdByUserUuid,
                            }),
                        )}
                        onChange={(e) => onSelect(e.target.checked)}
                    />
                </Center>
            </td>

            <Text component="td" fw={500}>
                {project.name}
            </Text>

            <td>
                <Group spacing="xs">
                    {isCurrentProject && (
                        <Badge variant="filled">
                            {t(
                                'components_user_settings_project_management_panel.current_project',
                            )}
                        </Badge>
                    )}
                    {project.type === ProjectType.PREVIEW && (
                        <Badge>
                            {t(
                                'components_user_settings_project_management_panel.preview',
                            )}
                        </Badge>
                    )}
                </Group>
            </td>

            <td width="1%">
                <div
                    style={{
                        visibility: isBulkActionActive ? 'hidden' : 'visible',
                    }}
                >
                    <Group noWrap position="right" spacing="sm">
                        <Can
                            I="update"
                            this={subject('Project', {
                                organizationUuid: user.data?.organizationUuid,
                                projectUuid: project.projectUuid,
                            })}
                        >
                            <Button
                                component={Link}
                                size="xs"
                                to={`/generalSettings/projectManagement/${project.projectUuid}`}
                                leftIcon={<MantineIcon icon={IconSettings} />}
                                variant="outline"
                                onClick={handleProjectSettingsClick}
                            >
                                {t(
                                    'components_user_settings_project_management_panel.settings',
                                )}
                            </Button>
                        </Can>

                        <Can
                            I="delete"
                            this={subject('Project', {
                                type: project.type,
                                projectUuid: project.projectUuid,
                                organizationUuid: user.data?.organizationUuid,
                                createdByUserUuid: project.createdByUserUuid,
                            })}
                        >
                            <Button
                                px="xs"
                                size="xs"
                                variant="outline"
                                color="red"
                                onClick={onDelete}
                            >
                                <MantineIcon icon={IconTrash} />
                            </Button>
                        </Can>
                    </Group>
                </div>
            </td>
        </tr>
    );
};

enum TabsValue {
    ALL = 'all',
    DEFAULT = 'default',
    PREVIEW = 'preview',
}

const ProjectManagementPanel: FC = () => {
    const { t } = useTranslation();

    const tableStyles = useTableStyles();
    const tableTabStyles = useTableTabStyles();
    const { user } = useApp();

    const TABS = [
        {
            value: TabsValue.ALL,
            label: t(
                'components_user_settings_project_management_panel.tabs.all',
            ),
        },
        {
            value: TabsValue.DEFAULT,
            label: t(
                'components_user_settings_project_management_panel.tabs.projects',
            ),
        },
        {
            value: TabsValue.PREVIEW,
            label: t(
                'components_user_settings_project_management_panel.tabs.preview',
            ),
        },
    ];

    const { data: projects = [], isInitialLoading: isLoadingProjects } =
        useProjects();
    const { data: lastProjectUuid, isInitialLoading: isLoadingLastProject } =
        useActiveProject();

    const [deletingProjectUuid, setDeletingProjectUuid] = useState<string>();
    const [deletingProjectInBulk, setDeletingProjectInBulk] = useState(false);

    const [activeTab, setActiveTab] = useState<TabsValue>(TabsValue.ALL);

    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

    const handleTabChange = useCallback((value: TabsValue) => {
        setSelectedProjects([]);
        setActiveTab(value);
    }, []);

    const handleSelect = useCallback(
        (projectUuid: string, isSelected: boolean) => {
            setSelectedProjects((prev) =>
                isSelected
                    ? [...prev, projectUuid]
                    : prev.filter((uuid) => uuid !== projectUuid),
            );
        },
        [],
    );

    const filteredProjects = useMemo(() => {
        return projects.filter((project) => {
            switch (activeTab) {
                case TabsValue.DEFAULT:
                    return project.type === ProjectType.DEFAULT;
                case TabsValue.PREVIEW:
                    return project.type === ProjectType.PREVIEW;
                case TabsValue.ALL:
                    return true;
                default:
                    return assertUnreachable(
                        activeTab,
                        `Unknown tab: ${activeTab}`,
                    );
            }
        });
    }, [projects, activeTab]);

    const handleSelectAll = useCallback(() => {
        if (activeTab !== TabsValue.PREVIEW) {
            throw new Error(
                'Select all is only available for preview projects',
            );
        }

        setSelectedProjects(
            filteredProjects.map((project) => project.projectUuid),
        );
    }, [activeTab, filteredProjects]);

    const allSelectedProjects = useMemo(() => {
        return selectedProjects
            .map((uuid) => projects.find((p) => p.projectUuid === uuid))
            .filter((p): p is OrganizationProject => !!p);
    }, [projects, selectedProjects]);

    const handleDeleteInBulk = useCallback(() => {
        setDeletingProjectInBulk(true);
    }, []);

    const handleCloseDeleteInBulk = useCallback(() => {
        setSelectedProjects([]);
        setDeletingProjectInBulk(false);
    }, []);

    if (isLoadingProjects || isLoadingLastProject) return null;

    if (projects.length === 0) {
        return <Navigate to="/createProject" />;
    }

    const lastProject = projects.find(
        (project) => project.projectUuid === lastProjectUuid,
    );

    return (
        <Stack mb="lg">
            <Group position="apart">
                <Title order={5}>
                    {t(
                        'components_user_settings_project_management_panel.project_management_settings',
                    )}
                </Title>

                <Can
                    I="create"
                    this={subject('Project', {
                        organizationUuid: user.data?.organizationUuid,
                    })}
                >
                    <Button component={Link} to="/createProject">
                        {t(
                            'components_user_settings_project_management_panel.create_new',
                        )}
                    </Button>
                </Can>
            </Group>

            <SettingsCard sx={{ overflow: 'hidden' }} shadow="none" p={0}>
                <Group position="apart">
                    <Tabs
                        classNames={tableTabStyles.classes}
                        value={activeTab}
                        onTabChange={handleTabChange}
                    >
                        <Tabs.List>
                            {TABS.map(({ value, label }) => (
                                <Tabs.Tab key={value} value={value}>
                                    <Text color="gray.7" fz={15} fw={500}>
                                        {label}
                                    </Text>
                                </Tabs.Tab>
                            ))}
                        </Tabs.List>
                    </Tabs>

                    {selectedProjects.length > 0 && (
                        <Button
                            leftIcon={<MantineIcon icon={IconTrash} />}
                            compact
                            color="red"
                            mr="sm"
                            onClick={handleDeleteInBulk}
                        >
                            {t(
                                'components_user_settings_project_management_panel.delete',
                                {
                                    length: selectedProjects.length,
                                },
                            )}
                        </Button>
                    )}
                </Group>

                <Table className={tableStyles.classes.root}>
                    <thead>
                        <tr>
                            <th>
                                <div
                                    style={{
                                        whiteSpace: 'nowrap',
                                        visibility:
                                            activeTab === TabsValue.PREVIEW
                                                ? 'visible'
                                                : 'hidden',
                                    }}
                                >
                                    <Anchor size="xs" onClick={handleSelectAll}>
                                        {t(
                                            'components_user_settings_project_management_panel.table.select_all',
                                        )}
                                    </Anchor>
                                </div>
                            </th>
                            <th>
                                {t(
                                    'components_user_settings_project_management_panel.table.name',
                                )}
                            </th>
                            <th></th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProjects.map((project) => (
                            <ProjectListItem
                                key={project.projectUuid}
                                project={project}
                                isCurrentProject={
                                    lastProject?.projectUuid ===
                                    project.projectUuid
                                }
                                isBulkActionActive={selectedProjects.length > 0}
                                isSelected={selectedProjects.includes(
                                    project.projectUuid,
                                )}
                                onSelect={(isSelected) =>
                                    handleSelect(
                                        project.projectUuid,
                                        isSelected,
                                    )
                                }
                                onDelete={() =>
                                    setDeletingProjectUuid(project.projectUuid)
                                }
                            />
                        ))}
                    </tbody>
                </Table>
            </SettingsCard>

            {deletingProjectUuid ? (
                <ProjectDeleteModal
                    opened={deletingProjectUuid !== undefined}
                    onClose={() => setDeletingProjectUuid(undefined)}
                    isCurrentProject={deletingProjectUuid === lastProjectUuid}
                    projectUuid={deletingProjectUuid}
                />
            ) : null}

            {deletingProjectInBulk && (
                <ProjectDeleteInBulkModal
                    currentProjectUuid={lastProjectUuid ?? null}
                    opened={selectedProjects.length > 0}
                    onClose={handleCloseDeleteInBulk}
                    projects={allSelectedProjects}
                />
            )}
        </Stack>
    );
};

export default ProjectManagementPanel;
