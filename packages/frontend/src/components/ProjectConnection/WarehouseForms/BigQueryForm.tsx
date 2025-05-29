import { WarehouseTypes } from '@lightdash/common';
import {
    Anchor,
    FileInput,
    NumberInput,
    Select,
    Stack,
    TextInput,
} from '@mantine/core';
import { useState, type ChangeEvent, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useToggle } from 'react-use';

import DocumentationHelpButton from '../../DocumentationHelpButton';
import FormCollapseButton from '../FormCollapseButton';
import { useFormContext } from '../formContext';
import FormSection from '../Inputs/FormSection';
import StartOfWeekSelect from '../Inputs/StartOfWeekSelect';
import { useProjectFormContext } from '../useProjectFormContext';
import { BigQueryDefaultValues } from './defaultValues';

export const BigQuerySchemaInput: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const { t } = useTranslation();

    return (
        <TextInput
            name="warehouse.dataset"
            {...form.getInputProps('warehouse.dataset')}
            label={t(
                'components_project_connection_warehouse_form.big_query.dataset.label',
            )}
            description={
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
                    <DocumentationHelpButton href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#data-set" />
                </p>
            }
            required
            disabled={disabled}
        />
    );
};

const BigQueryForm: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();
    const [isOpen, toggleOpen] = useToggle(false);
    const form = useFormContext();
    const [temporaryFile, setTemporaryFile] = useState<File | null>(null);
    const { savedProject } = useProjectFormContext();
    const requireSecrets: boolean =
        savedProject?.warehouseConnection?.type !== WarehouseTypes.BIGQUERY;

    const locationField = form.getInputProps('warehouse.location');
    const executionProjectField = form.getInputProps(
        'warehouse.executionProject',
    );
    const onChangeFactory =
        (onChange: (value: string | undefined) => void) =>
        (e: ChangeEvent<HTMLInputElement>) => {
            onChange(e.target.value === '' ? undefined : e.target.value);
        };

    return (
        <>
            <Stack style={{ marginTop: '8px' }}>
                <TextInput
                    name="warehouse.project"
                    label={t(
                        'components_project_connection_warehouse_form.big_query.project.label',
                    )}
                    description={t(
                        'components_project_connection_warehouse_form.big_query.project.description',
                    )}
                    required
                    {...form.getInputProps('warehouse.project')}
                    disabled={disabled}
                    labelProps={{ style: { marginTop: '8px' } }}
                />

                <TextInput
                    name="warehouse.location"
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
                    {...locationField}
                    onChange={onChangeFactory(locationField.onChange)}
                    disabled={disabled}
                />

                <FileInput
                    name="warehouse.keyfileContents"
                    {...form.getInputProps('warehouse.keyfileContents', {
                        withError: true,
                    })}
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
                    required={requireSecrets}
                    accept="application/json"
                    value={temporaryFile}
                    onChange={(file) => {
                        if (!file) {
                            form.setFieldValue(
                                'warehouse.keyfileContents',
                                null,
                            );
                            return;
                        }

                        const fileReader = new FileReader();
                        fileReader.onload = function (event) {
                            const contents = event.target?.result;

                            if (typeof contents === 'string') {
                                try {
                                    setTemporaryFile(file);
                                    form.setFieldValue(
                                        'warehouse.keyfileContents',
                                        JSON.parse(contents),
                                    );
                                } catch (error) {
                                    // 🤷‍♂️
                                    setTimeout(() => {
                                        form.setFieldError(
                                            'warehouse.keyfileContents',
                                            'Invalid JSON file',
                                        );
                                    });

                                    form.setFieldValue(
                                        'warehouse.keyfileContents',
                                        null,
                                    );
                                }
                            } else {
                                form.setFieldValue(
                                    'warehouse.keyfileContents',
                                    null,
                                );
                                setTemporaryFile(null);
                            }
                        };
                        fileReader.readAsText(file);
                    }}
                    disabled={disabled}
                />

                <FormSection isOpen={isOpen} name="advanced">
                    <Stack style={{ marginTop: '8px' }}>
                        <TextInput
                            name="warehouse.executionProject"
                            label={t(
                                'components_project_connection_warehouse_form.big_query.execution_project.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.execution_project.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/docs/core/connect-data-platform/bigquery-setup#execution-project"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.execution_project.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.execution_project.description.part_3',
                                    )}
                                </p>
                            }
                            {...executionProjectField}
                            onChange={onChangeFactory(
                                executionProjectField.onChange,
                            )}
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.timeoutSeconds"
                            {...form.getInputProps('warehouse.timeoutSeconds')}
                            label={t(
                                'components_project_connection_warehouse_form.big_query.timeout.label',
                            )}
                            defaultValue={BigQueryDefaultValues.timeoutSeconds}
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

                        <Select
                            name="warehouse.priority"
                            {...form.getInputProps('warehouse.priority')}
                            defaultValue={BigQueryDefaultValues.priority}
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
                            disabled={disabled}
                        />

                        <NumberInput
                            name="warehouse.retries"
                            {...form.getInputProps('warehouse.retries')}
                            defaultValue={BigQueryDefaultValues.retries}
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

                        <NumberInput
                            name="warehouse.maximumBytesBilled"
                            {...form.getInputProps(
                                'warehouse.maximumBytesBilled',
                            )}
                            defaultValue={
                                BigQueryDefaultValues.maximumBytesBilled
                            }
                            label={t(
                                'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.label',
                            )}
                            description={
                                <p>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.description.part_1',
                                    )}{' '}
                                    <Anchor
                                        target="_blank"
                                        href="https://docs.getdbt.com/reference/warehouse-profiles/bigquery-profile#maximum-bytes-billed"
                                        rel="noreferrer"
                                    >
                                        {t(
                                            'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.description.part_2',
                                        )}
                                    </Anchor>
                                    {t(
                                        'components_project_connection_warehouse_form.big_query.maximum_bytes_billed.description.part_3',
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
                        'components_project_connection_warehouse_form.big_query.advanced_configuration_options',
                    )}
                </FormCollapseButton>
            </Stack>
        </>
    );
};

export default BigQueryForm;
