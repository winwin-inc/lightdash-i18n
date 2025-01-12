import { WarehouseTypes } from '@lightdash/common';
import { Anchor, PasswordInput, Stack, TextInput } from '@mantine/core';
import React, { type FC } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../useProjectFormContext';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const DatabricksSchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            // this supposed to be a `schema` but changing it will break for existing customers
            label={t(
                'components_project_connection_warehouse_form.databricks.schema.label',
            )}
            description={
                <p>
                    {t(
                        'components_project_connection_warehouse_form.databricks.schema.description.part_1',
                    )}
                    <Anchor
                        target="_blank"
                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#database-1"
                        rel="noreferrer"
                    >
                        {t(
                            'components_project_connection_warehouse_form.databricks.schema.description.part_2',
                        )}
                    </Anchor>
                    {t(
                        'components_project_connection_warehouse_form.databricks.schema.description.part_3',
                    )}
                </p>
            }
            required
            {...register('warehouse.database', {
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Schema'),
                },
            })}
            disabled={disabled}
        />
    );
};

const DatabricksForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;
    const { register } = useFormContext();
    const { t } = useTranslation();

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.databricks.server.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.databricks.server.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#server-hostname"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.databricks.server.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.databricks.server.description.part_3',
                            )}
                        </p>
                    }
                    required
                    {...register('warehouse.serverHostName', {
                        validate: {
                            hasNoWhiteSpaces:
                                hasNoWhiteSpaces('Server host name'),
                        },
                    })}
                    disabled={disabled}
                    placeholder={t(
                        'components_project_connection_warehouse_form.databricks.server.placeholder',
                    )}
                    labelProps={{ style: { marginTop: '8px' } }}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.databricks.http_path.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.databricks.http_path.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#http-path"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.databricks.http_path.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.databricks.http_path.description.part_3',
                            )}
                        </p>
                    }
                    required
                    {...register('warehouse.httpPath', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('HTTP Path'),
                        },
                    })}
                    disabled={disabled}
                    placeholder={t(
                        'components_project_connection_warehouse_form.databricks.http_path.placeholder',
                    )}
                />
                <PasswordInput
                    {...register('warehouse.personalAccessToken')}
                    label={t(
                        'components_project_connection_warehouse_form.databricks.access_token.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.databricks.access_token.description.part_1',
                            )}
                            <Anchor
                                target="_blank"
                                href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#personal-access-token"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.databricks.access_token.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.databricks.access_token.description.part_3',
                            )}
                        </p>
                    }
                    required={requireSecrets}
                    placeholder={
                        disabled || !requireSecrets
                            ? '**************'
                            : undefined
                    }
                    disabled={disabled}
                />
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.databricks.catalog.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.databricks.catalog.description',
                    )}
                    required
                    {...register('warehouse.catalog', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Catalog name'),
                        },
                    })}
                    disabled={disabled}
                />
                <FormSection isOpen={isOpen} name="advanced">
                    <StartOfWeekSelect disabled={disabled} />
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.databricks.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default DatabricksForm;
