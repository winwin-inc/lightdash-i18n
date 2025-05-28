import {
    DbtVersionOptionLatest,
    DefaultSupportedDbtVersion,
    getLatestSupportDbtVersion,
    SupportedDbtVersions,
} from '@lightdash/common';
import { Select } from '@mantine/core';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useFormContext } from '../formContext';

const DbtVersionSelect: FC<{
    disabled: boolean;
}> = ({ disabled }) => {
    const form = useFormContext();
    const field = form.getInputProps('dbtVersion');
    const { t } = useTranslation();

    return (
        <Select
            label={t('components_project_connection_dbt_version.dbt_version')}
            name="dbtVersion"
            defaultValue={DefaultSupportedDbtVersion}
            data={[
                {
                    value: DbtVersionOptionLatest.LATEST,
                    label: `latest (${getLatestSupportDbtVersion()})`,
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
    );
};

export default DbtVersionSelect;
