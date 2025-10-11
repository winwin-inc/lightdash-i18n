import {
    ActionIcon,
    Button,
    Checkbox,
    Group,
    Popover,
    ScrollArea,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import { IconBox, IconHelpCircle, IconX } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../../components/common/MantineIcon';
import { useProjects } from '../../../../../hooks/useProjects';
import { useAiAgentAdminAgents } from '../../hooks/useAiAgentAdmin';
import { type useAiAgentAdminFilters } from '../../hooks/useAiAgentAdminFilters';
import classes from './ProjectsFilter.module.css';

type ProjectsFilterProps = Pick<
    ReturnType<typeof useAiAgentAdminFilters>,
    'selectedProjectUuids' | 'setSelectedProjectUuids'
> & {
    tooltipLabel?: string;
};

const ProjectsFilter: FC<ProjectsFilterProps> = ({
    selectedProjectUuids,
    setSelectedProjectUuids,
    tooltipLabel,
}) => {
    const { t } = useTranslation();

    const currentTooltipLabel =
        tooltipLabel ||
        t(
            'ai_agent_form_setup_admin.projects_filter.filter_threads_by_project',
        );

    const { data: projects, isLoading } = useProjects();
    const organizationAiAgents = useAiAgentAdminAgents();

    const projectsWithAgents = useMemo(() => {
        if (!projects || !organizationAiAgents.data) return [];

        const projectUuidsWithAgents = new Set(
            organizationAiAgents.data.map((agent) => agent.projectUuid),
        );

        return projects.filter((project) =>
            projectUuidsWithAgents.has(project.projectUuid),
        );
    }, [projects, organizationAiAgents.data]);

    const hasSelectedProjects = selectedProjectUuids.length > 0;

    const projectNames = useMemo(() => {
        return projectsWithAgents
            ?.filter((project) =>
                selectedProjectUuids.includes(project.projectUuid),
            )
            .map((project) => project.name)
            .join(', ');
    }, [projectsWithAgents, selectedProjectUuids]);

    const buttonLabel = hasSelectedProjects
        ? projectNames
        : t('ai_agent_form_setup_admin.projects_filter.all_projects');

    return (
        <Group gap="two">
            <Popover width={300} position="bottom-start">
                <Popover.Target>
                    <Tooltip
                        withinPortal
                        variant="xs"
                        label={currentTooltipLabel}
                    >
                        <Button
                            h={32}
                            c="gray.7"
                            fw={500}
                            fz="sm"
                            variant="default"
                            radius="md"
                            py="xs"
                            px="sm"
                            leftSection={
                                <MantineIcon
                                    icon={IconBox}
                                    size="md"
                                    color={
                                        hasSelectedProjects
                                            ? 'indigo.5'
                                            : 'gray.5'
                                    }
                                />
                            }
                            loading={
                                isLoading || organizationAiAgents.isLoading
                            }
                            className={
                                hasSelectedProjects
                                    ? classes.filterButtonSelected
                                    : classes.filterButton
                            }
                            classNames={{
                                label: classes.buttonLabel,
                            }}
                        >
                            {buttonLabel}
                        </Button>
                    </Tooltip>
                </Popover.Target>
                <Popover.Dropdown p="sm">
                    <Stack gap={4}>
                        <Group gap="two">
                            <Text fz="xs" c="dark.3" fw={600}>
                                {t(
                                    'ai_agent_form_setup_admin.projects_filter.filter_by_projects',
                                )}
                                :
                            </Text>
                            <Tooltip
                                variant="xs"
                                label={t(
                                    'ai_agent_form_setup_admin.projects_filter.showing_projects_with_agents_only',
                                )}
                            >
                                <MantineIcon
                                    color="gray.5"
                                    icon={IconHelpCircle}
                                />
                            </Tooltip>
                        </Group>

                        {projectsWithAgents?.length === 0 && (
                            <Text fz="xs" fw={500} c="gray.6">
                                {t(
                                    'ai_agent_form_setup_admin.projects_filter.no_projects_with_agents_available',
                                )}
                            </Text>
                        )}

                        <ScrollArea.Autosize
                            mah={200}
                            type="always"
                            scrollbars="y"
                        >
                            <Stack gap="xs">
                                {projectsWithAgents.map((project) => (
                                    <Checkbox
                                        key={project.projectUuid}
                                        label={project.name}
                                        checked={selectedProjectUuids.includes(
                                            project.projectUuid,
                                        )}
                                        size="xs"
                                        classNames={{
                                            body: classes.checkboxBody,
                                            input: classes.checkboxInput,
                                            label: classes.checkboxLabel,
                                        }}
                                        onChange={() => {
                                            if (
                                                selectedProjectUuids.includes(
                                                    project.projectUuid,
                                                )
                                            ) {
                                                setSelectedProjectUuids(
                                                    selectedProjectUuids.filter(
                                                        (uuid) =>
                                                            uuid !==
                                                            project.projectUuid,
                                                    ),
                                                );
                                            } else {
                                                setSelectedProjectUuids([
                                                    ...selectedProjectUuids,
                                                    project.projectUuid,
                                                ]);
                                            }
                                        }}
                                    />
                                ))}
                            </Stack>
                        </ScrollArea.Autosize>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
            {hasSelectedProjects && (
                <Tooltip
                    variant="xs"
                    label={t(
                        'ai_agent_form_setup_admin.projects_filter.clear_all_project_filters',
                    )}
                >
                    <ActionIcon
                        size="xs"
                        color="gray.5"
                        variant="subtle"
                        onClick={() => {
                            setSelectedProjectUuids([]);
                        }}
                    >
                        <MantineIcon icon={IconX} />
                    </ActionIcon>
                </Tooltip>
            )}
        </Group>
    );
};

export default ProjectsFilter;
