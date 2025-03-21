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
import { useProjectFormContext } from '../useProjectFormContext';
import DbtVersionSelect from '../WarehouseForms/Inputs/DbtVersion';

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
                                'components_project_connection_dbt_form.gitlab.access_token.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_dbt_form.gitlab.access_token.description.part_2',
                                )}
                            </Anchor>
                            .
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.access_token.description.part_3',
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
                            'components_project_connection_dbt_form.gitlab.repository.description.part_1',
                        )}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.repository.description.part_2',
                            )}
                        </b>
                        {t(
                            'components_project_connection_dbt_form.gitlab.repository.description.part_3',
                        )}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.repository.description.part_4',
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
            <DbtVersionSelect disabled={disabled} />

            <TextInput
                label={t(
                    'components_project_connection_dbt_form.gitlab.branch.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.part_1',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.part_2',
                                )}
                            </b>
                            ,{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.part_3',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.part_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.part_5',
                                )}
                            </b>
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.part_6',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.branch.description.part_7',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.branch.description.part_8',
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
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_1',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_2',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_3',
                            )}
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_5',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_6',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_7',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_8',
                            )}
                        </p>

                        <p>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_9',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_10',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_11',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_12',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.gitlab.project_directory_path.description.part_13',
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
                            'components_project_connection_dbt_form.gitlab.host_domain.description.part_1',
                        )}
                        <Anchor
                            href="http://gitlab.io/"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {' '}
                            {t(
                                'components_project_connection_dbt_form.gitlab.host_domain.description.part_2',
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
