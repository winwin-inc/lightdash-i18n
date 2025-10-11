import { WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    NumberInput,
    PasswordInput,
    Stack,
    TextInput,
} from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import BooleanSwitch from '../Inputs/BooleanSwitch';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import { ClickhouseDefaultValues } from './defaultValues';

export const ClickhouseSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            name="warehouse.schema"
            label={t('components_project_connection_clickhouse.schema.label')}
            description={t(
                'components_project_connection_clickhouse.schema.description',
            )}
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const ClickhouseForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();

    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.CLICKHOUSE;
    const form = useFormContext();

    if (form.values.warehouse?.type !== WarehouseTypes.CLICKHOUSE) {
        throw new Error('This form is only available for ClickHouse');
    }

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.host"
                    label={t(
                        'components_project_connection_clickhouse.host.label',
                    )}
                    description={t(
                        'components_project_connection_clickhouse.host.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.user"
                    label={t(
                        'components_project_connection_clickhouse.user.label',
                    )}
                    description={t(
                        'components_project_connection_clickhouse.user.description',
                    )}
                    required={requireSecrets}
                    {...form.getInputProps('warehouse.user')}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <PasswordInput
                    name="warehouse.password"
                    label={t(
                        'components_project_connection_clickhouse.password.label',
                    )}
                    description={t(
                        'components_project_connection_clickhouse.password.description',
                    )}
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    {...form.getInputProps('warehouse.password')}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label={t(
                                'components_project_connection_clickhouse.require_user_credentials.label',
                            )}
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                { type: 'checkbox' },
                            )}
                            defaultChecked={
                                ClickhouseDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={ClickhouseDefaultValues.port}
                            label={t(
                                'components_project_connection_clickhouse.port.label',
                            )}
                            description={t(
                                'components_project_connection_clickhouse.port.description',
                            )}
                            required
                            disabled={disabled}
                        />

                        <BooleanSwitch
                            name="warehouse.secure"
                            label={t(
                                'components_project_connection_clickhouse.https.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_clickhouse.https.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-setups/clickhouse-setup"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_clickhouse.https.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_clickhouse.https.description.part_3',
                                    )}
                                </p>
                            }
                            {...form.getInputProps('warehouse.secure', {
                                type: 'checkbox',
                            })}
                            defaultChecked={ClickhouseDefaultValues.secure}
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            defaultValue={
                                ClickhouseDefaultValues.timeoutSeconds
                            }
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label={t(
                                'components_project_connection_clickhouse.timeout.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_clickhouse.timeout.description',
                                    )}
                                </p>
                            }
                            required
                            disabled={disabled}
                        />

                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_clickhouse.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default ClickhouseForm;
