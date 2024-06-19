import { DbtProjectType } from '@lightdash/common';
import { Anchor, PasswordInput, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import {
    hasNoWhiteSpaces,
    isGitRepository,
    startWithSlash,
} from '../../../utils/fieldValidators';
import { useProjectFormContext } from '../ProjectFormProvider';

const BitBucketForm: FC<{ disabled: boolean }> = ({ disabled }) => {
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.dbtConnection.type !== DbtProjectType.BITBUCKET;
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <>
            <TextInput
                label={t(
                    'components_project_connection_dbt_form.bit_bucket.username.label',
                )}
                description={t(
                    'components_project_connection_dbt_form.bit_bucket.username.description',
                )}
                required
                {...register('dbt.username', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Username'),
                    },
                })}
                disabled={disabled}
                placeholder={t(
                    'components_project_connection_dbt_form.bit_bucket.username.placeholder',
                )}
            />
            <PasswordInput
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
                {...register('dbt.personal_access_token')}
                placeholder={
                    disabled || !requireSecrets ? '**************' : undefined
                }
                disabled={disabled}
            />
            <TextInput
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
                {...register('dbt.repository', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Repository'),
                        isGitRepository: isGitRepository('Repository'),
                    },
                })}
                disabled={disabled}
                placeholder={t(
                    'components_project_connection_dbt_form.bit_bucket.repository.placeholder',
                )}
            />
            <TextInput
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
                defaultValue="bitbucket.org"
                {...register('dbt.host_domain', {
                    validate: {
                        hasNoWhiteSpaces: hasNoWhiteSpaces('Host domain'),
                    },
                })}
            />
        </>
    );
};

export default BitBucketForm;
