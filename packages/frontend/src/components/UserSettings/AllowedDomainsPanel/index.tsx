import {
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
    isValidEmailDomain,
    validateOrganizationEmailDomains,
    type AllowedEmailDomains,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Flex,
    MultiSelect,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { useForm, zodResolver } from '@mantine/form';
import { IconHelpCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import {
    forwardRef,
    useEffect,
    useMemo,
    type FC,
    type ForwardedRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
    useAllowedEmailDomains,
    useUpdateAllowedEmailDomains,
} from '../../../hooks/organization/useAllowedDomains';
import { useProjects } from '../../../hooks/useProjects';
import MantineIcon from '../../common/MantineIcon';

const validationSchema = z.object({
    emailDomains: z.array(z.string().nonempty()),
    role: z.nativeEnum(OrganizationMemberRole),
    projects: z.array(
        z.object({
            projectUuid: z.string().nonempty(),
            role: z.nativeEnum(ProjectMemberRole),
        }),
    ),
});

type FormValues = z.infer<typeof validationSchema>;

const AllowedDomainsPanel: FC = () => {
    const form = useForm<FormValues>({
        initialValues: {
            emailDomains: [],
            role: OrganizationMemberRole.VIEWER,
            projects: [],
        },
        validate: zodResolver(validationSchema),
    });
    const { t } = useTranslation();

    const { data: projects, isLoading: isLoadingProjects } = useProjects();

    const {
        data: allowedEmailDomainsData,
        isLoading: isAllowedEmailDomainsDataLoading,
        isSuccess,
    } = useAllowedEmailDomains();

    const { mutate, isLoading: isUpdateAllowedEmailDomainsLoading } =
        useUpdateAllowedEmailDomains();

    const isLoading =
        isUpdateAllowedEmailDomainsLoading ||
        isAllowedEmailDomainsDataLoading ||
        isLoadingProjects;

    const roleOptions: Array<{
        value: AllowedEmailDomains['role'];
        label: string;
        subLabel: string;
    }> = [
        {
            value: OrganizationMemberRole.EDITOR,
            label: t(
                'components_user_settings_allowed_domains_panel.role_options.editor.label',
            ),
            subLabel: t(
                'components_user_settings_allowed_domains_panel.role_options.editor.sub_label',
            ),
        },
        {
            value: OrganizationMemberRole.INTERACTIVE_VIEWER,
            label: t(
                'components_user_settings_allowed_domains_panel.role_options.interactive_viewer.label',
            ),
            subLabel: t(
                'components_user_settings_allowed_domains_panel.role_options.interactive_viewer.sub_label',
            ),
        },
        {
            value: OrganizationMemberRole.VIEWER,
            label: t(
                'components_user_settings_allowed_domains_panel.role_options.viewer.label',
            ),
            subLabel: t(
                'components_user_settings_allowed_domains_panel.role_options.viewer.sub_label',
            ),
        },
        {
            value: OrganizationMemberRole.MEMBER,
            label: t(
                'components_user_settings_allowed_domains_panel.role_options.member.label',
            ),
            subLabel: t(
                'components_user_settings_allowed_domains_panel.role_options.member.sub_label',
            ),
        },
    ];

    const projectRoleOptions: Array<{
        value: ProjectMemberRole;
        label: string;
        subLabel: string;
    }> = [
        {
            value: ProjectMemberRole.EDITOR,
            label: t(
                'components_user_settings_allowed_domains_panel.project_options.editor.label',
            ),
            subLabel: t(
                'components_user_settings_allowed_domains_panel.project_options.editor.sub_label',
            ),
        },
        {
            value: ProjectMemberRole.INTERACTIVE_VIEWER,
            label: t(
                'components_user_settings_allowed_domains_panel.project_options.interactive_viewer.label',
            ),
            subLabel: t(
                'components_user_settings_allowed_domains_panel.project_options.interactive_viewer.sub_label',
            ),
        },
        {
            value: ProjectMemberRole.VIEWER,
            label: t(
                'components_user_settings_allowed_domains_panel.project_options.viewer.label',
            ),
            subLabel: t(
                'components_user_settings_allowed_domains_panel.project_options.viewer.sub_label',
            ),
        },
    ];

    useEffect(() => {
        if (isAllowedEmailDomainsDataLoading || !allowedEmailDomainsData)
            return;

        const initialValues = {
            emailDomains: allowedEmailDomainsData.emailDomains,
            role: allowedEmailDomainsData.role,
            projects: allowedEmailDomainsData.projects,
        };

        form.setInitialValues(initialValues);
        form.setValues(initialValues);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [allowedEmailDomainsData, isAllowedEmailDomainsDataLoading]);

    const projectOptions = useMemo(() => {
        if (!projects) return [];

        return projects
            .filter(({ type }) => type !== ProjectType.PREVIEW)
            .map((item) => ({
                value: item.projectUuid,
                label: item.name,
            }));
    }, [projects]);

    const handleSubmit = form.onSubmit((values) => {
        if (!form.isValid()) return;

        const role =
            values.emailDomains.length > 0
                ? values.role
                : OrganizationMemberRole.VIEWER;

        const newProjects =
            role === OrganizationMemberRole.MEMBER ? values.projects : [];

        mutate({
            emailDomains: values.emailDomains,
            role: role as AllowedEmailDomains['role'],
            projects: newProjects as AllowedEmailDomains['projects'],
        });
    });

    const canAddMoreProjects = useMemo(
        () => form.values.projects.length < projectOptions.length,
        [form.values.projects, projectOptions.length],
    );

    const handleAddProject = () => {
        const nonSelectedProjects = projectOptions.filter(({ value }) => {
            const isSelected = form.values.projects.find(
                (project) => project.projectUuid === value,
            );
            return !isSelected;
        });
        if (nonSelectedProjects.length > 0) {
            form.insertListItem('projects', {
                projectUuid: nonSelectedProjects[0].value,
                role: ProjectMemberRole.VIEWER,
            });
        }
    };

    return isSuccess ? (
        <form name="allowedEmailDomains" onSubmit={handleSubmit}>
            <Stack>
                <MultiSelect
                    creatable
                    searchable
                    name="emailDomains"
                    label={t(
                        'components_user_settings_allowed_domains_panel.form.email_domains.label',
                    )}
                    placeholder={t(
                        'components_user_settings_allowed_domains_panel.form.email_domains.placeholder',
                    )}
                    disabled={isLoading}
                    data={form.values.emailDomains.map((emailDomain) => ({
                        value: emailDomain,
                        label: emailDomain,
                    }))}
                    onCreate={(value) => {
                        if (!isValidEmailDomain(value)) {
                            form.setFieldError(
                                'emailDomains',
                                t(
                                    'components_user_settings_allowed_domains_panel.form.email_domains.error',
                                    {
                                        value,
                                    },
                                ),
                            );
                            return;
                        }

                        const isInvalidOrganizationEmailDomainMessage =
                            validateOrganizationEmailDomains([
                                ...form.values.emailDomains,
                                value,
                            ]);
                        if (isInvalidOrganizationEmailDomainMessage) {
                            form.setFieldError(
                                'emailDomains',
                                isInvalidOrganizationEmailDomainMessage,
                            );
                            return;
                        }

                        return value;
                    }}
                    getCreateLabel={(query: string) =>
                        t(
                            'components_user_settings_allowed_domains_panel.form.email_domains.create_label',
                            {
                                query,
                            },
                        )
                    }
                    defaultValue={form.values.emailDomains}
                    {...form.getInputProps('emailDomains')}
                />

                {!!form.values.emailDomains.length && (
                    <>
                        <Select
                            label={t(
                                'components_user_settings_allowed_domains_panel.form.default_role.label',
                            )}
                            name="role"
                            placeholder={t(
                                'components_user_settings_allowed_domains_panel.form.default_role.placeholder',
                            )}
                            disabled={isLoading}
                            data={roleOptions}
                            itemComponent={forwardRef(
                                (
                                    { subLabel, label, ...others }: any,
                                    ref: ForwardedRef<HTMLDivElement>,
                                ) => (
                                    <Stack
                                        ref={ref}
                                        spacing="xs"
                                        p="xs"
                                        {...others}
                                    >
                                        <Text size="sm">{label}</Text>
                                        <Text size="xs">{subLabel}</Text>
                                    </Stack>
                                ),
                            )}
                            defaultValue={OrganizationMemberRole.VIEWER}
                            {...form.getInputProps('role')}
                            onChange={(value) => {
                                if (value) {
                                    form.setFieldValue(
                                        'role',
                                        value as AllowedEmailDomains['role'],
                                    );
                                    // set default project when changing to member role
                                    if (
                                        value ===
                                            OrganizationMemberRole.MEMBER &&
                                        form.values.projects.length === 0
                                    ) {
                                        handleAddProject();
                                    }
                                }
                            }}
                        />

                        {form.values.role === OrganizationMemberRole.MEMBER ? (
                            <div>
                                <Title order={5} mb="md">
                                    {t(
                                        'components_user_settings_allowed_domains_panel.form_member.title',
                                    )}
                                </Title>

                                <Stack spacing="sm" align="flex-start">
                                    {form.values.projects.map(
                                        ({ projectUuid }, index) => (
                                            <Flex
                                                key={projectUuid}
                                                align="flex-end"
                                                gap="xs"
                                            >
                                                <Select
                                                    size="xs"
                                                    disabled={isLoading}
                                                    label={
                                                        index === 0
                                                            ? t(
                                                                  'components_user_settings_allowed_domains_panel.form_member.project_name',
                                                              )
                                                            : undefined
                                                    }
                                                    data={projectOptions.filter(
                                                        ({ value }) => {
                                                            const isCurrentValue =
                                                                value ===
                                                                form.values
                                                                    .projects[
                                                                    index
                                                                ].projectUuid;
                                                            if (
                                                                isCurrentValue
                                                            ) {
                                                                return true;
                                                            }
                                                            const isSelected =
                                                                form.values.projects.find(
                                                                    (project) =>
                                                                        project.projectUuid ===
                                                                        value,
                                                                );
                                                            return !isSelected;
                                                        },
                                                    )}
                                                    {...form.getInputProps(
                                                        `projects.${index}.projectUuid`,
                                                    )}
                                                />

                                                <Select
                                                    label={
                                                        index === 0
                                                            ? t(
                                                                  'components_user_settings_allowed_domains_panel.form_member.project_role',
                                                              )
                                                            : undefined
                                                    }
                                                    disabled={isLoading}
                                                    size="xs"
                                                    data={projectRoleOptions}
                                                    itemComponent={forwardRef(
                                                        (
                                                            {
                                                                selected,
                                                                subLabel,
                                                                label,
                                                                ...others
                                                            }: any,
                                                            ref: ForwardedRef<HTMLDivElement>,
                                                        ) => {
                                                            return (
                                                                <Flex
                                                                    ref={ref}
                                                                    gap="xs"
                                                                    justify="space-between"
                                                                    align="center"
                                                                    {...others}
                                                                >
                                                                    <Text size="xs">
                                                                        {label}
                                                                    </Text>

                                                                    <Tooltip
                                                                        withinPortal
                                                                        multiline
                                                                        label={
                                                                            subLabel
                                                                        }
                                                                    >
                                                                        <MantineIcon
                                                                            color={
                                                                                selected
                                                                                    ? 'white'
                                                                                    : 'grey'
                                                                            }
                                                                            icon={
                                                                                IconHelpCircle
                                                                            }
                                                                        />
                                                                    </Tooltip>
                                                                </Flex>
                                                            );
                                                        },
                                                    )}
                                                    defaultValue={
                                                        ProjectMemberRole.VIEWER
                                                    }
                                                    {...form.getInputProps(
                                                        `projects.${index}.role`,
                                                    )}
                                                />

                                                <ActionIcon
                                                    color="red"
                                                    variant="outline"
                                                    size={30}
                                                    disabled={isLoading}
                                                    onClick={() =>
                                                        form.removeListItem(
                                                            'projects',
                                                            index,
                                                        )
                                                    }
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                        size="sm"
                                                    />
                                                </ActionIcon>
                                            </Flex>
                                        ),
                                    )}

                                    <Tooltip
                                        withinPortal
                                        multiline
                                        disabled={canAddMoreProjects}
                                        label={t(
                                            'components_user_settings_allowed_domains_panel.tooltip.label',
                                        )}
                                    >
                                        <Button
                                            {...(!canAddMoreProjects && {
                                                'data-disabled': true,
                                            })}
                                            sx={{
                                                '&[data-disabled="true"]': {
                                                    pointerEvents: 'all',
                                                },
                                            }}
                                            onClick={handleAddProject}
                                            variant="outline"
                                            size="xs"
                                            leftIcon={
                                                <MantineIcon icon={IconPlus} />
                                            }
                                        >
                                            {t(
                                                'components_user_settings_allowed_domains_panel.tooltip.content',
                                            )}
                                        </Button>
                                    </Tooltip>
                                </Stack>
                            </div>
                        ) : null}
                    </>
                )}

                <Flex justify="flex-end" gap="sm">
                    {form.isDirty() && !isUpdateAllowedEmailDomainsLoading && (
                        <Button variant="outline" onClick={() => form.reset()}>
                            {t(
                                'components_user_settings_allowed_domains_panel.cancel',
                            )}
                        </Button>
                    )}
                    <Button
                        type="submit"
                        display="block"
                        loading={isLoading}
                        disabled={!form.isDirty()}
                    >
                        {t(
                            'components_user_settings_allowed_domains_panel.update',
                        )}
                    </Button>
                </Flex>
            </Stack>
        </form>
    ) : null;
};

export default AllowedDomainsPanel;
