import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
    hasNoWhiteSpaces,
    isGitRepository,
    startWithSlash,
} from '../../../utils/fieldValidators';
import { useProjectFormContext } from '../ProjectFormProvider';

const GitlabForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITLAB;
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <>
            <PasswordInput
                {...register('dbt.personal_access_token')}
                label={t(
                    'components_project_connection_dbt_form.gitlab.access_token.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.access_token.description.step_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_dbt_form.gitlab.access_token.description.step_2',
                                )}
                            </Anchor>
                            .
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.access_token.description.step_3',
                            )}
                        </p>
                    </>
                }
                required={requireSecrets}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.gitlab.repository.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.gitlab.repository.description.step_1',
                        )}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.repository.description.step_2',
                            )}
                        </b>
                        {t(
                            'components_project_connection_dbt_form.gitlab.repository.description.step_3',
                        )}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.repository.description.step_4',
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
                    'components_project_connection_dbt_form.gitlab.repository.placeholder',
                )}
            />
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.gitlab.branch.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.step_1',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.step_2',
                                )}
                            </b>
                            ,{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.step_3',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.step_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.step_5',
                                )}
                            </b>
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.step_6',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.step_7',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.step_8',
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
                    'components_project_connection_dbt_form.gitlab.project_directory_path.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_1',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_2',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_3',
                            )}
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_5',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_6',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_7',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_8',
                            )}
                        </p>

                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_9',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_10',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_11',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_12',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.step_13',
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
                    'components_project_connection_dbt_form.gitlab.host_domain.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.gitlab.host_domain.description.step_1',
                        )}
                        <Anchor
                            href="http://gitlab.io/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.host_domain.description.step_2',
                            )}
                        </Anchor>
                        .
                    </p>
                }
                disabled={disabled}
                defaultValue="gitlab.com"
                {...register('dbt.host_domain', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Host domain'),
                    },
                })}
            />
        </>
    );
};

export default GitlabForm;
