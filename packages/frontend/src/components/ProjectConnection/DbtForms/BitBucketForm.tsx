import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormContext } from '../formContext';
import DbtVersionSelect from '../Inputs/DbtVersion';
import { useProjectFormContext } from '../useProjectFormContext';
import { bitbucketDefaultValues } from './defaultValues';

const BitBucketForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.BITBUCKET;
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <>
            <TextInput
                name="dbt.username"
                {...form.getInputProps('dbt.username')}
                label={t(
                    'components_project_connection_dbt_form.bit_bucket.username.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.bit_bucket.username.description',
                )}
                required
                disabled={disabled}
                placeholder={t(
                    'components_project_connection_dbt_form.bit_bucket.username.placeholder',
                )}
            />
            <PasswordInput
                name="dbt.personal_access_token"
                {...form.getInputProps('dbt.personal_access_token')}
                label={t(
                    'components_project_connection_dbt_form.bit_bucket.access_token.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.access_token.description.part_1',
                            )}
                            <Anchor
                                href="https://support.atlassian.com/bitbucket-cloud/docs/create-an-app-password/"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.access_token.description.part_2',
                                )}
                            </Anchor>
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.access_token.description.part_3',
                            )}
                            <Anchor
                                href="https://confluence.atlassian.com/bitbucketserver/http-access-tokens-939515499.html"
                                target="_blank"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.access_token.description.part_4',
                                )}
                            </Anchor>
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.access_token.description.part_5',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.access_token.description.part_6',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.access_token.description.part_7',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.access_token.description.part_8',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.access_token.description.part_9',
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
                name="dbt.repository"
                {...form.getInputProps('dbt.repository')}
                label={t(
                    'components_project_connection_dbt_form.bit_bucket.repository.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.bit_bucket.repository.description.part_1',
                        )}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.repository.description.part_2',
                            )}
                        </b>
                        {t(
                            'components_project_connection_dbt_form.bit_bucket.repository.description.part_3',
                        )}{' '}
                        <b>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.repository.description.part_4',
                            )}
                        </b>
                    </p>
                }
                required
                disabled={disabled}
                placeholder={t(
                    'components_project_connection_dbt_form.bit_bucket.repository.placeholder',
                )}
            />
            <DbtVersionSelect disabled={disabled} />

            <TextInput
                name="dbt.branch"
                {...form.getInputProps('dbt.branch')}
                label={t(
                    'components_project_connection_dbt_form.bit_bucket.branch.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.branch.description.part_1',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.branch.description.part_2',
                                )}
                            </b>
                            ,{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.branch.description.part_3',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.branch.description.part_4',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.branch.description.part_5',
                                )}
                            </b>
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.branch.description.part_6',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.branch.description.part_7',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.branch.description.part_8',
                            )}
                        </p>
                    </>
                }
                required
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.branch}
            />
            <TextInput
                name="dbt.project_sub_path"
                {...form.getInputProps('dbt.project_sub_path')}
                label={t(
                    'components_project_connection_dbt_form.bit_bucket.project_directory_path.label',
                )}
                description={
                    <>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_1',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_2',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_3',
                            )}
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_4',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_5',
                                )}
                            </b>{' '}
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_6',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_7',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_8',
                            )}
                        </p>
                        <p>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_9',
                            )}{' '}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_10',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_11',
                            )}
                            <b>
                                {t(
                                    'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_12',
                                )}
                            </b>
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.project_directory_path.description.part_13',
                            )}
                        </p>
                    </>
                }
                required
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.project_sub_path}
            />
            <TextInput
                name="dbt.host_domain"
                {...form.getInputProps('dbt.host_domain')}
                label={t(
                    'components_project_connection_dbt_form.bit_bucket.host_domain.label',
                )}
                description={
                    <p>
                        {t(
                            'components_project_connection_dbt_form.bit_bucket.host_domain.description.part_1',
                        )}
                        <Anchor
                            href="https://confluence.atlassian.com/bitbucketserver/specify-the-bitbucket-base-url-776640392.html"
                            target="_blank"
                            rel="noreferrer"
                        >
                            {t(
                                'components_project_connection_dbt_form.bit_bucket.host_domain.description.part_2',
                            )}
                        </Anchor>
                        {t(
                            'components_project_connection_dbt_form.bit_bucket.host_domain.description.part_3',
                        )}
                    </p>
                }
                disabled={disabled}
                defaultValue={bitbucketDefaultValues.host_domain}
            />
        </>
    );
};

export default BitBucketForm;
