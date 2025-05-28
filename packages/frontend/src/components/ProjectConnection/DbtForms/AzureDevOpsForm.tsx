import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { azureDevopsDefaultValues } from './defaultValues';

const AzureDevOpsForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const { t } = useTranslation();

    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.AZURE_DEVOPS;
    const form = useFormContext();

    return (
        <>
            <PasswordInput
                name="dbt.personal_access_token"
                {...form.getInputProps('dbt.personal_access_token')}
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.password.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.part_1',
                            )}
                            <Anchor
                                href="https://docs.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate?view=azure-devops&tabs=Windows"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {' '}
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.password.description.part_2',
                                )}{' '}
                            </Anchor>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.part_3',
                            )}
                        </p>

                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.part_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.password.description.part_5',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.password.description.part_6',
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
                name="dbt.organization"
                {...form.getInputProps('dbt.organization')}
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.organization.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.azure_dev_pos.organization.description',
                )}
                required
                disabled={disabled}
            />
            <TextInput
                name="dbt.project"
                {...form.getInputProps('dbt.project')}
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.project.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.azure_dev_pos.project.description',
                )}
                required
                disabled={disabled}
            />
            <TextInput
                name="dbt.repository"
                {...form.getInputProps('dbt.repository')}
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.repository.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.azure_dev_pos.repository.description',
                )}
                required
                disabled={disabled}
            />
            <DbtVersionSelect disabled={disabled} />

            <TextInput
                name="dbt.branch"
                {...form.getInputProps('dbt.branch')}
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.branch.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_1',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_2',
                                )}
                            </b>
                            ,{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_3',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_4',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_5',
                                )}
                            </b>
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_6',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_7',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.branch.description.part_8',
                            )}
                        </p>
                    </>
                }
                required
                disabled={disabled}
                defaultValue={azureDevopsDefaultValues.branch}
            />
            <TextInput
                name="dbt.project_sub_path"
                {...form.getInputProps('dbt.project_sub_path')}
                label={t(
                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_1',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_2',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_3',
                            )}
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_5',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_6',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_7',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_8',
                            )}
                        </p>

                        <p>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_9',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_10',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_11',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_12',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.azure_dev_pos.project_directory_path.description.part_13',
                            )}
                        </p>
                    </>
                }
                required
                disabled={disabled}
                defaultValue={azureDevopsDefaultValues.project_sub_path}
            />
        </>
    );
};

export default AzureDevOpsForm;
