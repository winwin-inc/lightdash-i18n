import { WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    NumberInput,
    PasswordInput,
    Select,
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
import { TrinoDefaultValues } from './defaultValues';

export const TrinoSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            name="warehouse.schema"
            label={t(
                'components_project_connection_warehouse_form.trino.schema.label',
            )}
            description={t(
                'components_project_connection_warehouse_form.trino.schema.description',
            )}
            required
            {...form.getInputProps('warehouse.schema')}
            disabled={disabled}
        />
    );
};

const TrinoForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.TRINO;
    const form = useFormContext();
    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.host"
                    label={t(
                        'components_project_connection_warehouse_form.trino.host.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.trino.host.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.host')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    name="warehouse.user"
                    label={t(
                        'components_project_connection_warehouse_form.trino.user.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.trino.user.description',
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
                        'components_project_connection_warehouse_form.trino.password.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.trino.password.description',
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
                <TextInput
                    name="warehouse.dbname"
                    label={t(
                        'components_project_connection_warehouse_form.trino.db_name.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.trino.db_name.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.dbname')}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <BooleanSwitch
                            name="warehouse.requireUserCredentials"
                            label={t(
                                'components_project_connection_warehouse_form.trino.switch.label',
                            )}
                            {...form.getInputProps(
                                'warehouse.requireUserCredentials',
                                { type: 'checkbox' },
                            )}
                            defaultChecked={
                                TrinoDefaultValues.requireUserCredentials
                            }
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.port"
                            {...form.getInputProps('warehouse.port')}
                            defaultValue={TrinoDefaultValues.port}
                            label={t(
                                'components_project_connection_warehouse_form.trino.port.label',
                            )}
                            description={t(
                                'components_project_connection_warehouse_form.trino.port.description',
                            )}
                            required
                            disabled={disabled}
                        />

                        <Select
                            name="warehouse.http_scheme"
                            {...form.getInputProps('warehouse.http_scheme')}
                            defaultValue={TrinoDefaultValues.http_scheme}
                            label={t(
                                'components_project_connection_warehouse_form.trino.http_scheme.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.trino.http_scheme.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-setups/trino-setup#configuration"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.trino.http_scheme.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.trino.http_scheme.description.part_3',
                                    )}
                                </p>
                            }
                            data={['http', 'https'].map((x) => ({
                                value: x,
                                label: x,
                            }))}
                            disabled={disabled}
                        />

                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.trino.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default TrinoForm;
