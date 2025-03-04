import {
    DbtVersionOptionLatest,
    DefaultSupportedDbtVersion,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import { Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

const DbtVersionSelect: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const { t } = useTranslation();

    return (
        <Controller
            name="dbtVersion"
            defaultValue={DefaultSupportedDbtVersion}
            render={({ field }) => (
                <Select
                    label={t(
                        'components_project_connection_warehouse_form.dbt_version',
                    )}
                    data={[
                        {
                            value: DbtVersionOptionLatest.LATEST,
                            label: `${t(
                                'components_project_connection_warehouse_form.latest',
                            )} (${getLatestSupportDbtVersion()})`,
                        },
                        ...Object.values(SupportedDbtVersions)
                            .reverse()
                            .map((version) => ({
                                value: version,
                                label: version,
                            })),
                    ]}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={disabled}
                />
            )}
        />
    );
};

export default DbtVersionSelect;
