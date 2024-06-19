import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
    hasNoWhiteSpaces,
    startWithSlash,
} from '../../../utils/fieldValidators';
import { useProjectFormContext } from '../ProjectFormProvider';

const AzureDevOpsForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.AZURE_DEVOPS;
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <>
            <PasswordInput
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.password.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.step_1',
                            )}
                            <Anchor
                                href="https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {' '}
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.password.description.step_2',
                                )}{' '}
                            </Anchor>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.step_3',
                            )}
                        </p>

                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.step_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.password.description.step_5',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.step_6',
                            )}
                        </p>
                    </>
                }
                required={requireSecrets}
                {...register('dbt.personal_access_token')}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.organization.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.azure_dev_pos.organization.description',
                )}
                {...register('dbt.organization', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                })}
                required
                disabled={disabled}
            />
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.project.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.azure_dev_pos.project.description',
                )}
                required
                {...register('dbt.project', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                })}
                disabled={disabled}
            />
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.repository.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.azure_dev_pos.repository.description',
                )}
                required
                {...register('dbt.repository', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                    },
                })}
                disabled={disabled}
            />
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.branch.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_1',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_2',
                                )}
                            </b>
                            ,{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_3',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_4',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_5',
                                )}
                            </b>
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_6',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_7',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.step_8',
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
                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_1',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_2',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_3',
                            )}
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_5',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_6',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_7',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_8',
                            )}
                        </p>

                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_9',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_10',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_11',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_12',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.step_13',
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
        </>
    );
};

export default AzureDevOpsForm;
