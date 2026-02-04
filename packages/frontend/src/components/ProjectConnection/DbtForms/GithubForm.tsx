import { DbtProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Avatar,
    Button,
    Group,
    PasswordInput,
    ScrollArea,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
    type ScrollAreaProps,
} from '@mantine/core';
import { IconCheck, IconRefresh } from '@tabler/icons-react';
import React, { useEffect, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import useToaster from '../../../hooks/toaster/useToaster';
import githubIcon from '../../../svgs/github-icon.svg';
import {
    useGithubConfig,
    useGitHubRepositories,
} from '../../common/GithubIntegration/hooks/useGithubIntegration';
import MantineIcon from '../../common/MantineIcon';
import { getApiUrl } from '../../../api';
import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { githubDefaultValues } from './defaultValues';

const DropdownComponentOverride = ({
    children,
    installationId,
}: {
    children: ReactNode;
    installationId: string | undefined;
}) => {
    const { t } = useTranslation();

    return (
        <Stack w="100%" spacing={0}>
            <ScrollArea>{children}</ScrollArea>

            <Tooltip
                withinPortal
                position="left"
                width={300}
                multiline
                label={t(
                    'components_project_connection_dbt_form.github.dropdown_tooltip.part_1',
                )}
            >
                <Text
                    color="dimmed"
                    size="xs"
                    px="sm"
                    p="xxs"
                    sx={(theme) => ({
                        cursor: 'pointer',
                        borderTop: `1px solid ${theme.colors.gray[2]}`,
                        '&:hover': {
                            backgroundColor: theme.colors.gray[1],
                        },
                    })}
                    onClick={() =>
                        window.open(
                            `https://github.com/settings/installations/${installationId}`,
                            '_blank',
                        )
                    }
                >
                    {t(
                        'components_project_connection_dbt_form.github.dropdown_tooltip.part_2',
                    )}{' '}
                    <Anchor>
                        {t(
                            'components_project_connection_dbt_form.github.dropdown_tooltip.part_3',
                        )}
                    </Anchor>
                </Text>
            </Tooltip>
        </Stack>
    );
};

const GithubLoginForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const form = useFormContext();
    const { data: config, refetch } = useGithubConfig();
    const {
        data: repos,
        isError,
        refetch: refetchRepos,
    } = useGitHubRepositories();
    const isValidGithubInstallation =
        config?.installationId !== undefined && !isError;
    const { t } = useTranslation();

    useEffect(() => {
        if (
            config?.installationId &&
            form.values.dbt.type === DbtProjectType.GITHUB &&
            form.values.dbt.installation_id != config.installationId
        ) {
            form.setFieldValue('dbt.installation_id', config.installationId);
        }
    }, [config?.installationId, form]);

    useEffect(() => {
        if (
            repos &&
            repos.length > 0 &&
            form.values.dbt.type === DbtProjectType.GITHUB &&
            form.values.dbt.repository === ''
        ) {
            form.setFieldValue('dbt.repository', repos[0].fullName);
        }
    }, [repos, form]);

    const { showToastSuccess } = useToaster();

    const repositoryField = form.getInputProps('dbt.repository');

    if (isValidGithubInstallation) {
        return (
            <>
                {repos && repos.length > 0 && (
                    <Group spacing="xs">
                        <Select
                            name="dbt.repository"
                            searchable
                            required
                            w="90%"
                            label={t(
                                'components_project_connection_dbt_form.github.repository.label',
                            )}
                            disabled={disabled}
                            data={repos.map((repo) => ({
                                value: repo.fullName,
                                label: repo.fullName,
                            }))}
                            dropdownComponent={({
                                children,
                            }: ScrollAreaProps) => (
                                <DropdownComponentOverride
                                    installationId={config?.installationId}
                                >
                                    {children}
                                </DropdownComponentOverride>
                            )}
                            {...repositoryField}
                            value={repositoryField.value}
                            onChange={(value) => {
                                if (value === 'configure') {
                                    window.open(
                                        `https://github.com/settings/installations/${config?.installationId}`,
                                        '_blank',
                                    );
                                    return;
                                }
                                repositoryField.onChange(value);
                            }}
                        />

                        <Tooltip
                            label={t(
                                'components_project_connection_dbt_form.github.repository.refresh_repositories',
                            )}
                        >
                            <ActionIcon
                                mt="20px"
                                onClick={() => refetchRepos()}
                                disabled={!isValidGithubInstallation}
                            >
                                <MantineIcon icon={IconRefresh} color="gray" />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                )}
            </>
        );
    }

    return (
        <>
            {' '}
            <Button
                leftIcon={
                    <Avatar
                        src={githubIcon}
                        size="sm"
                        styles={{ image: { filter: 'invert(1)' } }}
                    />
                }
                sx={() => ({
                    backgroundColor: 'black',
                    color: 'white',
                    '&:hover': {
                        backgroundColor: 'gray.8',
                    },
                })}
                onClick={() => {
                    window.open(
                        getApiUrl('/github/install'),
                        '_blank',
                        'popup=true,width=600,height=700',
                    );
                    // Poll the API to check if the installation is successful
                    const interval = setInterval(() => {
                        refetch()
                            .then((s) => {
                                if (
                                    s.status === 'success' &&
                                    s.data.installationId
                                ) {
                                    showToastSuccess({
                                        title: 'Successfully connected to GitHub',
                                    });

                                    clearInterval(interval);
                                    void refetchRepos();
                                }
                            })
                            .catch(() => {});
                    }, 2000);
                }}
            >
                {t(
                    'components_project_connection_dbt_form.github.sign_in_with_github',
                )}
            </Button>
            <TextInput
                label="Repository"
                readOnly
                description={t(
                    'components_project_connection_dbt_form.github.repository.login_first',
                )}
                required
                sx={(theme) => ({
                    // Make it look disabled
                    input: {
                        backgroundColor: theme.colors.gray[1],
                        cursor: 'not-allowed',
                        pointerEvents: 'none',
                    },
                })}
                autoComplete="off"
                value="" // Don't allow writting in this field
            />
        </>
    );
};

const GithubPersonalAccessTokenForm: FC<{ disabled: boolean }> = ({
    disabled,
}) => {
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITHUB;

    const { t } = useTranslation();

    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                label={t(
                    'components_project_connection_dbt_form.github.personal_access_token.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.github.personal_access_token.description.part_1',
                        )}{' '}
                        <Anchor
                            target="_blank"
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#github"
                            rel="noreferrer"
                        >
                            {t(
                                'components_project_connection_dbt_form.github.personal_access_token.description.part_2',
                            )}
                        </Anchor>
                        {t(
                            'components_project_connection_dbt_form.github.personal_access_token.description.part_3',
                        )}
                    </p>
                }
                required={requireSecrets}
                {...form.getInputProps('dbt.personal_access_token')}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.github.repository.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.github.repository.description.part_1',
                        )}{' '}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.github.repository.description.part_2',
                            )}
                        </b>
                        {t(
                            'components_project_connection_dbt_form.github.repository.description.part_3',
                        )}{' '}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.github.repository.description.part_4',
                            )}
                        </b>
                    </p>
                }
                required
                {...form.getInputProps('dbt.repository')}
                disabled={disabled}
                placeholder={t(
                    'components_project_connection_dbt_form.github.repository.placeholder',
                )}
            />
        </>
    );
};

const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const form = useFormContext();
    const { data: githubConfig } = useGithubConfig();
    const { t } = useTranslation();

    if (form.values.dbt.type !== DbtProjectType.GITHUB) {
        throw new Error('GithubForm can only be used for Github projects');
    }

    const formAuthorizationMethod = form.values.dbt?.authorization_method;
    const authorizationMethod: string =
        formAuthorizationMethod ??
        (savedProject?.dbtConnection.type === DbtProjectType.GITHUB &&
        savedProject?.dbtConnection?.personal_access_token !== undefined
            ? 'personal_access_token'
            : 'installation_id');

    useEffect(() => {
        if (formAuthorizationMethod !== authorizationMethod) {
            form.setFieldValue('dbt.authorization_method', authorizationMethod);
        }
    }, [authorizationMethod, formAuthorizationMethod, form]);

    const isInstallationValid =
        githubConfig?.enabled && authorizationMethod === 'installation_id';

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <Group spacing="sm">
                    <Select
                        name="dbt.authorization_method"
                        {...form.getInputProps('dbt.authorization_method')}
                        defaultValue={
                            // If installation is not valid, we still show personal_access_token on existing saved projects
                            isInstallationValid || savedProject === undefined
                                ? 'installation_id'
                                : 'personal_access_token'
                        }
                        description={
                            isInstallationValid ? (
                                <Text>
                                    {t(
                                        'components_project_connection_dbt_form.github.authorization_method.select.part_1',
                                    )}{' '}
                                    <Anchor
                                        href="/generalSettings/integrations"
                                        target="_blank"
                                    >
                                        {t(
                                            'components_project_connection_dbt_form.github.authorization_method.select.part_2',
                                        )}
                                    </Anchor>
                                </Text>
                            ) : undefined
                        }
                        w={isInstallationValid ? '90%' : '100%'}
                        label="Authorization method"
                        data={[
                            {
                                value: 'installation_id',
                                label: t(
                                    'components_project_connection_dbt_form.github.authorization_method.data.oauth',
                                ),
                            },
                            {
                                value: 'personal_access_token',
                                label: t(
                                    'components_project_connection_dbt_form.github.authorization_method.data.personal_access_token',
                                ),
                            },
                        ]}
                        disabled={disabled}
                    />

                    {isInstallationValid && (
                        <Tooltip
                            label={t(
                                'components_project_connection_dbt_form.github.authorization_method.select.part_1',
                            )}
                        >
                            <Group mt="40px">
                                <MantineIcon icon={IconCheck} color="green" />
                            </Group>
                        </Tooltip>
                    )}
                </Group>
                {authorizationMethod === 'installation_id' ? (
                    <GithubLoginForm disabled={disabled} />
                ) : (
                    <GithubPersonalAccessTokenForm disabled={disabled} />
                )}

                <DbtVersionSelect disabled={disabled} />
                <TextInput
                    name="dbt.branch"
                    {...form.getInputProps('dbt.branch')}
                    label="Branch"
                    description={
                        <>
                            <p>
                                {t(
                                    'components_project_connection_dbt_form.github.branch.description.part_1',
                                )}
                                <b>
                                    {' '}
                                    {t(
                                        'components_project_connection_dbt_form.github.branch.description.part_2',
                                    )}
                                </b>
                                ,{' '}
                                <b>
                                    {' '}
                                    {t(
                                        'components_project_connection_dbt_form.github.branch.description.part_3',
                                    )}
                                </b>{' '}
                                {t(
                                    'components_project_connection_dbt_form.github.branch.description.part_4',
                                )}
                                <b>
                                    {t(
                                        'components_project_connection_dbt_form.github.branch.description.part_5',
                                    )}
                                </b>
                            </p>
                            <p>
                                {t(
                                    'components_project_connection_dbt_form.github.branch.description.part_6',
                                )}
                                <b>
                                    {' '}
                                    {t(
                                        'components_project_connection_dbt_form.github.branch.description.part_7',
                                    )}
                                </b>{' '}
                                {t(
                                    'components_project_connection_dbt_form.github.branch.description.part_8',
                                )}
                            </p>
                        </>
                    }
                    required
                    defaultValue={githubDefaultValues.branch}
                    disabled={disabled}
                />
                <TextInput
                    name="dbt.project_sub_path"
                    {...form.getInputProps('dbt.project_sub_path')}
                    label="Project directory path"
                    description={
                        <>
                            <p>
                                {t(
                                    'components_project_connection_dbt_form.github.project_directory_path.description.part_1',
                                )}
                                <b>/</b>
                                {t(
                                    'components_project_connection_dbt_form.github.project_directory_path.description.part_2',
                                )}
                                <b>
                                    {t(
                                        'components_project_connection_dbt_form.github.project_directory_path.description.part_3',
                                    )}
                                </b>{' '}
                                {t(
                                    'components_project_connection_dbt_form.github.project_directory_path.description.part_4',
                                )}
                            </p>
                            <p>
                                {t(
                                    'components_project_connection_dbt_form.github.project_directory_path.description.part_5',
                                )}
                                <b>
                                    {t(
                                        'components_project_connection_dbt_form.github.project_directory_path.description.part_6',
                                    )}
                                </b>{' '}
                                {t(
                                    'components_project_connection_dbt_form.github.project_directory_path.description.part_7',
                                )}
                            </p>
                        </>
                    }
                    required
                    disabled={disabled}
                    defaultValue={githubDefaultValues.project_sub_path}
                />
                <TextInput
                    name="dbt.host_domain"
                    {...form.getInputProps('dbt.host_domain')}
                    label={t(
                        'components_project_connection_dbt_form.github.host_domain.label',
                    )}
                    description={t(
                        'components_project_connection_dbt_form.github.host_domain.description',
                    )}
                    disabled={disabled}
                    defaultValue={githubDefaultValues.host_domain}
                />
            </Stack>
        </>
    );
};

export default GithubForm;
