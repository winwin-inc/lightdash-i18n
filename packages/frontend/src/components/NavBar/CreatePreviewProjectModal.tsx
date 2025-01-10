import { subject } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    MantineProvider,
    Modal,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconExternalLink, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { animals, colors, uniqueNamesGenerator } from 'unique-names-generator';

import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useCreatePreviewMutation } from '../../hooks/useProjectPreview';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';

type Props = {
    isOpened: boolean;
    onClose: () => void;
};

const CreatePreviewModal: FC<Props> = ({ isOpened, onClose }) => {
    const { user } = useApp();
    const { t } = useTranslation();

    const { isInitialLoading: isLoadingProjects, data: projects } =
        useProjects();
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { mutateAsync: createPreviewProject, isLoading: isPreviewCreating } =
        useCreatePreviewMutation();

    const [selectedProjectUuid, setSelectedProjectUuid] = useState<string>();
    const [previewName, setPreviewName] = useState('');

    const handleGeneratePreviewName = useCallback(() => {
        return uniqueNamesGenerator({
            length: 2,
            separator: ' ',
            dictionaries: [colors, animals],
        });
    }, []);

    const handleSelectProject = useCallback(
        (value: string) => {
            setPreviewName(handleGeneratePreviewName());
            setSelectedProjectUuid(value);
        },
        [handleGeneratePreviewName],
    );

    const regularProjectList = useMemo(() => {
        if (isLoadingProjects || !projects || !user.data) return [];

        return projects
            .filter((p) => p.type === ProjectType.DEFAULT)
            .map((project) => {
                const userCannotCreatePreview = user.data.ability.cannot(
                    'create',
                    subject('Project', {
                        organizationUuid: user.data.organizationUuid,
                        upstreamProjectUuid: project.projectUuid,
                        type: ProjectType.PREVIEW,
                    }),
                );

                return {
                    value: project.projectUuid,
                    label: project.name,
                    group: userCannotCreatePreview
                        ? 'Requires Developer Access'
                        : undefined,
                    disabled: userCannotCreatePreview,
                };
            })
            .sort((a, b) =>
                a.disabled === b.disabled ? 0 : a.disabled ? 1 : -1,
            );
    }, [isLoadingProjects, projects, user.data]);

    const selectedProject = useMemo(() => {
        if (selectedProjectUuid && projects) {
            return projects.find(
                (project) => project.projectUuid === selectedProjectUuid,
            );
        }
    }, [projects, selectedProjectUuid]);

    useEffect(() => {
        if (
            !isLoadingActiveProjectUuid &&
            activeProjectUuid &&
            !selectedProjectUuid &&
            projects
        ) {
            const activeProjectValue = regularProjectList.find(
                (project) => project.value === activeProjectUuid,
            );

            if (activeProjectValue && !activeProjectValue.disabled) {
                setSelectedProjectUuid(activeProjectUuid);
                setPreviewName(handleGeneratePreviewName());
            }
        }
    }, [
        activeProjectUuid,
        handleGeneratePreviewName,
        isLoadingActiveProjectUuid,
        projects,
        regularProjectList,
        selectedProjectUuid,
    ]);

    const handleCreatePreview = useCallback(async () => {
        if (!selectedProjectUuid || !previewName) return;

        await createPreviewProject({
            projectUuid: selectedProjectUuid,
            name: previewName,
        });
        onClose();
    }, [createPreviewProject, onClose, previewName, selectedProjectUuid]);

    return (
        <MantineProvider inherit theme={{ colorScheme: 'light' }}>
            <Modal
                size="lg"
                opened={isOpened}
                onClose={() => onClose()}
                title={
                    <Text fw={500}>
                        {t(
                            'components_navbar_create_preview_project_modal.create.part_1',
                        )}
                        {selectedProject ? (
                            <Text span>
                                {' '}
                                {t(
                                    'components_navbar_create_preview_project_modal.create.part_2',
                                )}{' '}
                                <Text span fw={600}>
                                    {selectedProject.name}
                                </Text>
                            </Text>
                        ) : (
                            ''
                        )}
                    </Text>
                }
            >
                <Stack>
                    <Stack spacing="sm">
                        <div>
                            <Text>
                                {t(
                                    'components_navbar_create_preview_project_modal.will_create.part_1',
                                )}
                                {selectedProject ? (
                                    <Text span>
                                        {' '}
                                        {t(
                                            'components_navbar_create_preview_project_modal.will_create.part_2',
                                        )}{' '}
                                        <Text span fw={500}>
                                            {selectedProject.name}
                                        </Text>
                                    </Text>
                                ) : null}
                            </Text>

                            <Anchor
                                href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-preview/"
                                target="_blank"
                            >
                                {t(
                                    'components_navbar_create_preview_project_modal.will_create.part_3',
                                )}{' '}
                                <MantineIcon
                                    size="sm"
                                    icon={IconExternalLink}
                                    display="inline-block"
                                />
                            </Anchor>
                        </div>

                        <Select
                            withinPortal
                            label={t(
                                'components_navbar_create_preview_project_modal.project.label',
                            )}
                            placeholder={t(
                                'components_navbar_create_preview_project_modal.project.placeholder',
                            )}
                            searchable
                            value={selectedProjectUuid}
                            disabled={
                                isLoadingActiveProjectUuid || isLoadingProjects
                            }
                            data={regularProjectList}
                            onChange={(value) => {
                                if (value) handleSelectProject(value);
                            }}
                        />

                        <TextInput
                            label={t(
                                'components_navbar_create_preview_project_modal.preview_name.label',
                            )}
                            placeholder={t(
                                'components_navbar_create_preview_project_modal.preview_name.placeholder',
                            )}
                            value={previewName}
                            disabled={isPreviewCreating}
                            onChange={(e) => {
                                setPreviewName(e.currentTarget.value);
                            }}
                            rightSection={
                                <Tooltip
                                    withinPortal
                                    label={t(
                                        'components_navbar_create_preview_project_modal.preview_name.tooltip',
                                    )}
                                >
                                    <ActionIcon
                                        onClick={() =>
                                            setPreviewName(
                                                handleGeneratePreviewName(),
                                            )
                                        }
                                    >
                                        <MantineIcon icon={IconRefresh} />
                                    </ActionIcon>
                                </Tooltip>
                            }
                        />
                    </Stack>

                    <Group position="right">
                        <Button variant="outline" onClick={onClose}>
                            {t(
                                'components_navbar_create_preview_project_modal.cancel',
                            )}
                        </Button>

                        <Button
                            disabled={
                                isPreviewCreating ||
                                !selectedProjectUuid ||
                                !previewName
                            }
                            loading={isPreviewCreating}
                            onClick={handleCreatePreview}
                        >
                            {isPreviewCreating
                                ? t(
                                      'components_navbar_create_preview_project_modal.creating_preview',
                                  )
                                : t(
                                      'components_navbar_create_preview_project_modal.create_preview',
                                  )}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </MantineProvider>
    );
};

export { CreatePreviewModal };
