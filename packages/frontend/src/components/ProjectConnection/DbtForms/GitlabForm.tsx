import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { gitlabDefaultValues } from './defaultValues';

const GitlabForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const { t } = useTranslation();

    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.GITLAB;
    const form = useFormContext();

    return (
        <>
            <PasswordInput
                {...form.getInputProps('dbt.personal_access_token')}
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
                {...form.getInputProps('dbt.repository')}
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
                {...form.getInputProps('dbt.branch')}
                disabled={disabled}
                defaultValue={gitlabDefaultValues.branch}
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
                {...form.getInputProps('dbt.project_sub_path')}
                disabled={disabled}
                defaultValue={gitlabDefaultValues.project_sub_path}
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
                {...form.getInputProps('dbt.host_domain')}
                defaultValue={gitlabDefaultValues.host_domain}
            />
        </>
    );
};

export default GitlabForm;
