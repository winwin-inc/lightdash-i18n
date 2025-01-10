import { WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    FileInput,
    NumberInput,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { useState, type FC } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import { hasNoWhiteSpaces } from '../../../utils/fieldValidators';
import FormSection from '../../ReactHookForm/FormSection';
import Input from '../../ReactHookForm/Input';
import FormCollapseButton from '../FormCollapseButton';
import { useProjectFormContext } from '../useProjectFormContext';
import StartOfWeekSelect from './Inputs/StartOfWeekSelect';

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();

    return (
        <Input
            name="warehouse.dataset"
            label={t(
                'components_project_connection_warehouse_form.big_query.dataset.label',
            )}
            labelHelp={
                <p>
                    {t(
                        'components_project_connection_warehouse_form.big_query.dataset.label_help.part_1',
                    )}
                    <b>
                        {t(
                            'components_project_connection_warehouse_form.big_query.dataset.label_help.part_2',
                        )}
                    </b>
                    {t(
                        'components_project_connection_warehouse_form.big_query.dataset.label_help.part_3',
                    )}{' '}
                    <Anchor
                        target="_blank"
                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#:~:text=This%20connection%20method%20requires%20local%20OAuth%20via%20gcloud."
                        rel="noreferrer"
                    >
                        {t(
                            'components_project_connection_warehouse_form.big_query.dataset.label_help.part_4',
                        )}
                        <b>
                            {t(
                                'components_project_connection_warehouse_form.big_query.dataset.label_help.part_5',
                            )}
                        </b>{' '}
                        {t(
                            'components_project_connection_warehouse_form.big_query.dataset.label_help.part_6',
                        )}
                    </Anchor>
                    .
                </p>
            }
            documentationUrl="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#data-set"
            rules={{
                required: 'Required field',
                validate: {
                    hasNoWhiteSpaces: hasNoWhiteSpaces('Data set'),
                },
            }}
            disabled={disabled}
        />
    );
};
const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);
    const { register } = useFormContext();
    const [temporaryFile, setTemporaryFile] = useState<File>();
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.BIGQUERY;

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.big_query.project.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.big_query.project.description',
                    )}
                    required
                    {...register('warehouse.project', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Project'),
                        },
                    })}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />

                <TextInput
                    label={t(
                        'components_project_connection_warehouse_form.big_query.location.label',
                    )}
                    description={
                        <p>
                            {t(
                                'components_project_connection_warehouse_form.big_query.location.description.part_1',
                            )}{' '}
                            <Anchor
                                target="_blank"
                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#dataset-locations"
                                rel="noreferrer"
                            >
                                {t(
                                    'components_project_connection_warehouse_form.big_query.location.description.part_2',
                                )}
                            </Anchor>
                            {t(
                                'components_project_connection_warehouse_form.big_query.location.description.part_3',
                            )}
                        </p>
                    }
                    {...register('warehouse.location', {
                        validate: {
                            hasNoWhiteSpaces: hasNoWhiteSpaces('Location'),
                        },
                        setValueAs: (value) =>
                            value === '' ? undefined : value,
                    })}
                    disabled={disabled}
                />

                <Controller
                    name="warehouse.keyfileContents"
                    render={({ field }) => (
                        <FileInput
                            {...field}
                            label={t(
                                'components_project_connection_warehouse_form.big_query.file.label',
                            )}
                            // FIXME: until mantine 7.4: https://github.com/mantinedev/mantine/issues/5401#issuecomment-1874906064
                            // @ts-ignore
                            placeholder={
                                !requireSecrets
                                    ? '**************'
                                    : t(
                                          'components_project_connection_warehouse_form.big_query.file.placeholder',
                                      )
                            }
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.file.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#key-file"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.file.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.file.description.part_3',
                                    )}
                                </p>
                            }
                            {...register('warehouse.keyfileContents')}
                            required={requireSecrets}
                            accept="application/json"
                            value={temporaryFile}
                            onChange={(file) => {
                                if (file) {
                                    const fileReader = new FileReader();
                                    fileReader.onload = function (event) {
                                        const contents = event.target?.result;
                                        if (typeof contents === 'string') {
                                            setTemporaryFile(file);
                                            field.onChange(
                                                JSON.parse(contents),
                                            );
                                        } else {
                                            field.onChange(null);
                                        }
                                    };
                                    fileReader.readAsText(file);
                                }
                                field.onChange(null);
                            }}
                            disabled={disabled}
                        />
                    )}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <TextInput
                            label="Execution project"
                            description={
                                <p>
                                    You may specify a project to bill for query
                                    execution, instead of the project/database
                                    where you materialize most resources. You
                                    can see more details in{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup#execution-project"
                                        rel="noreferrer"
                                    >
                                        dbt documentation
                                    </Anchor>
                                    .
                                </p>
                            }
                            {...register('warehouse.executionProject', {
                                validate: {
                                    hasNoWhiteSpaces:
                                        hasNoWhiteSpaces('Execution project'),
                                },
                                setValueAs: (value) =>
                                    value === '' ? undefined : value,
                            })}
                            disabled={disabled}
                        />

                        <Controller
                            name="warehouse.timeoutSeconds"
                            defaultValue={300}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label={t(
                                        'components_project_connection_warehouse_form.big_query.timeout.label',
                                    )}
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.timeout.description.part_1',
                                            )}{' '}
                                            <Anchor
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#timeouts"
                                                rel="noreferrer"
                                            >
                                                {t(
                                                    'components_project_connection_warehouse_form.big_query.timeout.description.part_2',
                                                )}
                                            </Anchor>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.timeout.description.part_3',
                                            )}
                                        </p>
                                    }
                                    required
                                    disabled={disabled}
                                />
                            )}
                        />
                        <Controller
                            name="warehouse.priority"
                            defaultValue="interactive"
                            render={({ field }) => (
                                <Select
                                    label={t(
                                        'components_project_connection_warehouse_form.big_query.priority.label',
                                    )}
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.priority.description.part_1',
                                            )}{' '}
                                            <Anchor
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#priority"
                                                rel="noreferrer"
                                            >
                                                {t(
                                                    'components_project_connection_warehouse_form.big_query.priority.description.part_2',
                                                )}
                                            </Anchor>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.priority.description.part_3',
                                            )}
                                        </p>
                                    }
                                    data={[
                                        {
                                            value: 'interactive',
                                            label: t(
                                                'components_project_connection_warehouse_form.big_query.priority.data.interactive',
                                            ),
                                        },
                                        {
                                            value: 'batch',
                                            label: t(
                                                'components_project_connection_warehouse_form.big_query.priority.data.batch',
                                            ),
                                        },
                                    ]}
                                    required
                                    value={field.value}
                                    onChange={field.onChange}
                                    disabled={disabled}
                                />
                            )}
                        />
                        <Controller
                            name="warehouse.retries"
                            defaultValue={3}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label={t(
                                        'components_project_connection_warehouse_form.big_query.retries.label',
                                    )}
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.retries.description.part_1',
                                            )}{' '}
                                            <Anchor
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#retries"
                                                rel="noreferrer"
                                            >
                                                {t(
                                                    'components_project_connection_warehouse_form.big_query.retries.description.part_2',
                                                )}
                                            </Anchor>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.retries.description.part_3',
                                            )}
                                        </p>
                                    }
                                    required
                                />
                            )}
                        />
                        <Controller
                            name="warehouse.maximumBytesBilled"
                            defaultValue={1000000000}
                            render={({ field }) => (
                                <NumberInput
                                    {...field}
                                    label={t(
                                        'components_project_connection_warehouse_form.big_query.maximun_bytes_billed.label',
                                    )}
                                    description={
                                        <p>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.maximun_bytes_billed.description.part_1',
                                            )}{' '}
                                            <Anchor
                                                target="_blank"
                                                href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#maximum-bytes-billed"
                                                rel="noreferrer"
                                            >
                                                {t(
                                                    'components_project_connection_warehouse_form.big_query.maximun_bytes_billed.description.part_2',
                                                )}
                                            </Anchor>
                                            {t(
                                                'components_project_connection_warehouse_form.big_query.maximun_bytes_billed.description.part_3',
                                            )}
                                        </p>
                                    }
                                    required
                                    disabled={disabled}
                                />
                            )}
                        />
                        <StartOfWeekSelect disabled={disabled} />
                    </Stack>
                </FormSection>
                <FormCollapseButton isSectionOpen={isOpen} onClick={toggleOpen}>
                    {t(
                        'components_project_connection_warehouse_form.big_query.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default BigQueryForm;
