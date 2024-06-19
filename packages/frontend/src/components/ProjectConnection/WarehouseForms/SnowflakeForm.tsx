import { FeatureFlags, WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    Group,
    PasswordInput,
    Stack,
    Switch,
    TextInput,
} from '@mantine/core';

import React, { type FC } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { useFeatureFlagEnabled } from '../../../hooks/useFeatureFlagEnabled';
import {
    hasNoWhiteSpaces,
    isUppercase,
    startWithHTTPSProtocol,
} from '../../../utils/fieldValidators';
import BooleanSwitch from '../../ReactHookForm/BooleanSwitch';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../ProjectFormProvider';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const SnowflakeSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            label={t(
                'components_project_connection_warehouse_form.snowflake.schema.label',
            )}
            description={t(
                'components_project_connection_warehouse_form.snowflake.schema.description',
            )}
            required
            {...register('warehouse.schema', {
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            })}
            disabled={disabled}
        />
    );
};

const SnowflakeForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const { register } = useFormContext();
    const { t } = useTranslation();

    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.SNOWFLAKE;
    const isPassthroughLoginFeatureEnabled = useFeatureFlagEnabled(
        FeatureFlags.PassthroughLogin,
    );

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.account.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.account.description',
                    )}
                    required
                    {...register('warehouse.account', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Account'),
                        },
                    })}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.user.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.user.description',
                    )}
                    required={requireSecrets}
                    {...register('warehouse.user', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('User'),
                        },
                    })}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <PasswordInput
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.password.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.password.description',
                    )}
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...register('warehouse.password')}
                    disabled={disabled}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.role.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.role.description',
                    )}
                    {...register('warehouse.role', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Role'),
                        },
                    })}
                    disabled={disabled}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.database.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.database.description',
                    )}
                    required
                    {...register('warehouse.database', {
                        validate: {
                            isUppercase: isUppercase('Database'),
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Database'),
                        },
                    })}
                    disabled={disabled}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.snowflake.warehouse.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.snowflake.warehouse.description',
                    )}
                    required
                    {...register('warehouse.warehouse', {
                        validate: {
                            isUppercase: isUppercase('Warehouse'),
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Warehouse'),
                        },
                    })}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        {isPassthroughLoginFeatureEnabled && (
                            <BooleanSwitch
                                name="warehouse.requireUserCredentials"
                                label={t(
                                    'components_project_connection_warehouse_form.snowflake.swicth.label',
                                )}
                                defaultValue={false}
                                disabled={disabled}
                            />
                        )}
                        <Controller
                            name="warehouse.clientSessionKeepAlive"
                            render={({ field }) => (
                                <Switch.Group
                                    label={t(
                                        'components_project_connection_warehouse_form.snowflake.keep_session_alive.label',
                                    )}
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.snowflake.keep_session_alive.description.part_1',
                                            )}{' '}
                                            <Anchor
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#client_session_keep_alive"
                                                rel="noreferrer"
                                            >
                                                {t(
                                                    'components_project_connection_warehouse_form.snowflake.keep_session_alive.description.part_2',
                                                )}
                                            </Anchor>
                                            {t(
                                                'components_project_connection_warehouse_form.snowflake.keep_session_alive.description.part_3',
                                            )}
                                        </p>
                                    }
                                    value={field.value ? ['true'] : []}
                                    onChange={(values) =>
                                        field.onChange(values.length > 0)
                                    }
                                    size="md"
                                >
                                    <Group mt="xs">
                                        <Switch
                                            onLabel={t(
                                                'components_project_connection_warehouse_form.snowflake.keep_session_alive.yes',
                                            )}
                                            offLabel={t(
                                                'components_project_connection_warehouse_form.snowflake.keep_session_alive.no',
                                            )}
                                            value="true"
                                            disabled={disabled}
                                        />
                                    </Group>
                                </Switch.Group>
                            )}
                        />

                        <TextInput
                            {...register('warehouse.queryTag')}
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.query_tag.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.query_tag.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/snowflake-profile#query_tag"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.snowflake.query_tag.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.query_tag.description.part_3',
                                    )}
                                </p>
                            }
                            disabled={disabled}
                        />
                        <TextInput
                            label={t(
                                'components_project_connection_warehouse_form.snowflake.snowflake_url_override.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.snowflake.snowflake_url_override.description',
                                    )}
                                </p>
                            }
                            disabled={disabled}
                            {...register('warehouse.accessUrl', {
                                validate: {
                                    startWithHTTPSProtocol:
                                        startWithHTTPSProtocol(
                                            'Snowflake URL override',
                                        ),
                                    hasNoWhiteSpaces: hasNoWhiteSpaces(
                                        'Snowflake URL override',
                                    ),
                                },
                            })}
                        />
                        <StartOfWeekSelect
                            disabled={disabled}
                            isRedeployRequired={false}
                        />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.snowflake.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default SnowflakeForm;
