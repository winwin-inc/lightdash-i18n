import { ProjectType } from '@lightdash/common';
import { Button, Flex, Select, Text, Title } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useProject } from '../../hooks/useProject';
import { useProjects } from '../../hooks/useProjects';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import { useUpdateMutation } from './hooks/useUpstreamProject';

export const DataOps: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data: projects } = useProjects();
    const { data: currentProject } = useProject(projectUuid);
    const { mutateAsync: updateMutation } = useUpdateMutation(projectUuid);
    const [selectedProject, setSelectedProject] = useState<string | null>(
        currentProject?.upstreamProjectUuid || null,
    );
    const { t } = useTranslation();

    return (
        <>
            <Text color="dimmed">{t('components_data_pos.tip')}</Text>

            <SettingsGridCard>
                <div>
                    <Title order={4}>
                        {t('components_data_pos.promote.title')}
                    </Title>
                    <Text c="gray.6" fz="xs">
                        {t('components_data_pos.promote.desc')}
                    </Text>
                </div>
                <div>
                    <Select
                        value={selectedProject}
                        clearable
                        data={
                            projects
                                ?.sort((a, b) => {
                                    if (a.type === b.type) {
                                        return 0;
                                    }
                                    return a.type === ProjectType.PREVIEW
                                        ? 1
                                        : -1;
                                })
                                .map((project) => ({
                                    label:
                                        project.projectUuid === projectUuid
                                            ? `${project.name} (Current)`
                                            : project.name,
                                    value: project.projectUuid,
                                    disabled:
                                        project.projectUuid === projectUuid,
                                    selected:
                                        project.projectUuid ===
                                        currentProject?.upstreamProjectUuid,
                                    group:
                                        project.type === ProjectType.PREVIEW
                                            ? 'Preview projects'
                                            : 'Production projects',
                                })) || []
                        }
                        label={t('components_data_pos.select.label')}
                        onChange={(value) => {
                            setSelectedProject(value || null);
                        }}
                        placeholder={t('components_data_pos.select_project')}
                    />
                    <Flex justify="flex-end" gap="sm" mt="sm">
                        <Button
                            type="submit"
                            display="block"
                            disabled={
                                selectedProject ===
                                currentProject?.upstreamProjectUuid
                            }
                            onClick={async () => {
                                await updateMutation({
                                    upstreamProjectUuid: selectedProject,
                                });
                            }}
                        >
                            {t('components_data_pos.update')}
                        </Button>
                    </Flex>
                </div>
            </SettingsGridCard>
        </>
    );
};
