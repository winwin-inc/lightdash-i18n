import { Alert, Select } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../common/MantineIcon';

const StartOfWeekSelect: FC<{
    disabled: boolean;
    isRedeployRequired?: boolean;
}> = ({ disabled, isRedeployRequired = true }) => {
    const { t } = useTranslation();

    const daysOfWeekOptions = [
        t('components_project_connection_warehouse_form.days_of_week.monday'),
        t('components_project_connection_warehouse_form.days_of_week.tuesday'),
        t(
            'components_project_connection_warehouse_form.days_of_week.wednesday',
        ),
        t('components_project_connection_warehouse_form.days_of_week.thursday'),
        t('components_project_connection_warehouse_form.days_of_week.friday'),
        t('components_project_connection_warehouse_form.days_of_week.saturday'),
        t('components_project_connection_warehouse_form.days_of_week.sunday'),
    ].map((x, index) => ({ value: index.toString(), label: x }));

    return (
        <Controller
            name="warehouse.startOfWeek"
            render={({ field }) => (
                <>
                    <Select
                        clearable
                        placeholder={t(
                            'components_project_connection_warehouse_form.inputs.placeholder',
                        )}
                        label={t(
                            'components_project_connection_warehouse_form.inputs.label',
                        )}
                        description={t(
                            'components_project_connection_warehouse_form.inputs.description',
                        )}
                        data={daysOfWeekOptions}
                        value={field.value?.toString()}
                        onChange={(value) =>
                            field.onChange(value ? parseInt(value) : null)
                        }
                        disabled={disabled}
                        dropdownPosition="top"
                    />
                    {isRedeployRequired && parseInt(field.value) >= 0 && (
                        <Alert
                            icon={
                                <MantineIcon
                                    icon={IconInfoCircle}
                                    size={'md'}
                                />
                            }
                            title={t(
                                'components_project_connection_warehouse_form.inputs.alert.title',
                            )}
                            color="blue"
                        >
                            {t(
                                'components_project_connection_warehouse_form.inputs.alert.content.step_1',
                            )}{' '}
                            <b>
                                <code>
                                    {t(
                                        'components_project_connection_warehouse_form.inputs.alert.content.step_2',
                                    )}
                                    {field.value}
                                </code>
                            </b>
                            {t(
                                'components_project_connection_warehouse_form.inputs.alert.content.step_3',
                            )}
                        </Alert>
                    )}
                </>
            )}
        />
    );
};

export default StartOfWeekSelect;
