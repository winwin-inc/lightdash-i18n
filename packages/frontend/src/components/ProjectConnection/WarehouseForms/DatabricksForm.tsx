import { WarehouseTypes } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import MantineIcon from '../../common/MantineIcon';
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
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.DATABRICKS;
    const { register, control } = useFormContext();
    const {
        fields: computeFields,
        append,
        remove,
    } = useFieldArray({
        control,
        name: 'warehouse.compute',
    });

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
                    <Stack>
                        <StartOfWeekSelect disabled={disabled} />
                        <Stack spacing="xs">
                            <Stack spacing={0}>
                                <Text fw={500}>Compute Resources</Text>
                                <Text c="dimmed" size="xs">
                                    Configure compute resources to use in your
                                    models
                                </Text>
                            </Stack>
                            <FormSection name="compute">
                                <Stack>
                                    {computeFields.map((field, index) => (
                                        <Group
                                            key={field.id}
                                            noWrap
                                            spacing="xs"
                                        >
                                            <TextInput
                                                style={{
                                                    flexGrow: 1,
                                                }}
                                                size="xs"
                                                {...register(
                                                    `warehouse.compute.${index}.name`,
                                                )}
                                                placeholder="Compute Name"
                                                required
                                            />
                                            <TextInput
                                                style={{
                                                    flexGrow: 1,
                                                }}
                                                size="xs"
                                                {...register(
                                                    `warehouse.compute.${index}.httpPath`,
                                                )}
                                                placeholder="HTTP Path"
                                                required
                                            />
                                            <Tooltip
                                                variant="xs"
                                                label="Remove compute"
                                            >
                                                <ActionIcon
                                                    size="sm"
                                                    onClick={() =>
                                                        remove(index)
                                                    }
                                                    style={{
                                                        flexGrow: 0,
                                                    }}
                                                >
                                                    <MantineIcon
                                                        icon={IconTrash}
                                                    />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Group>
                                    ))}
                                    <Button
                                        variant="default"
                                        size="xs"
                                        sx={(theme) => ({
                                            alignSelf: 'flex-end',
                                            boxShadow: theme.shadows.subtle,
                                        })}
                                        leftIcon={
                                            <MantineIcon icon={IconPlus} />
                                        }
                                        onClick={() =>
                                            append({
                                                name: '',
                                                httpPath: '',
                                            })
                                        }
                                    >
                                        Add compute
                                    </Button>
                                </Stack>
                            </FormSection>
                        </Stack>
                    </Stack>
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
