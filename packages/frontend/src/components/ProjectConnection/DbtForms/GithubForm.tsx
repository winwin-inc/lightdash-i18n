import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, Stack, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
    hasNoWhiteSpaces,
    isGitRepository,
    isValidGithubToken,
    startWithSlash,
} from '../../../utils/fieldValidators';
import { useProjectFormContext } from '../useProjectFormContext';

const GithubForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const { register } = useFormContext();
    const { t } = useTranslation();

    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITHUB;
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <PasswordInput
                    label={t(
                        'components_project_connection_dbt_form.github.access_token.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_dbt_form.github.access_token.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#github"
                                rel="noreferrer"
                            >
                                {' '}
                                {t(
                                    'components_project_connection_dbt_form.github.access_token.description.part_2',
                                )}
                            </Anchor>
                            .
                        </p>
                    }
                    required={requireSecrets}
                    {...register('dbt.personal_access_token', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces(
                                'Personal access token',
                            ),
                            isValidGithubToken: isValidGithubToken(
                                'Personal access token',
                            ),
                        },
                    })}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
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
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.github.repository.description.part_2',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.github.repository.description.part_3',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.github.repository.description.part_4',
                                )}
                            </b>
                        </p>
                    }
                    required
                    {...register('dbt.repository', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                            isGitRepository: isGitRepository('Repository'),
                        },
                    })}
                    disabled={disabled}
                    placeholder={t(
                        'components_project_connection_dbt_form.github.repository.placeholder',
                    )}
                />
                <TextInput
                    label={t(
                        'components_project_connection_dbt_form.github.branch.label',
                    )}
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
                    {...register('dbt.branch', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Branch'),
                        },
                    })}
                    disabled={disabled}
                    defaultValue="main"
                />
                <TextInput
                    label={t(
                        'components_project_connection_dbt_form.github.project_directory_path.label',
                    )}
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
                    {...register('dbt.project_sub_path', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces(
                                'Project directory path',
                            ),
                            startWithSlash: startWithSlash(
                                'Project directory path',
                            ),
                        },
                    })}
                    disabled={disabled}
                    defaultValue="/"
                />
                <TextInput
                    label={t(
                        'components_project_connection_dbt_form.github.host_domain.label',
                    )}
                    description={t(
                        'components_project_connection_dbt_form.github.host_domain.description',
                    )}
                    disabled={disabled}
                    defaultValue="github.com"
                    {...register('dbt.host_domain')}
                />
            </Stack>
        </>
    );
};

export default GithubForm;
