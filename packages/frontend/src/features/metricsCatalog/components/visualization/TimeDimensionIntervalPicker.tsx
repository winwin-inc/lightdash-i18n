import { TimeFrames, type TimeDimensionConfig } from '@lightdash/common';
import { Select } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../../components/common/MantineIcon';
import { useSelectStyles } from '../../styles/useSelectStyles';

type Props = {
    dimension: TimeDimensionConfig;
    onChange: (timeDimensionOverride: TimeDimensionConfig) => void;
};

export const TimeDimensionIntervalPicker: FC<Props> = ({
    dimension,
    onChange,
}) => {
    const { t } = useTranslation();
    const { classes } = useSelectStyles();
    const [optimisticInterval, setOptimisticInterval] = useState(
        dimension.interval,
    );
    return (
        <Select
            w={100}
            size="xs"
            radius="md"
            color="gray"
            data={[
                {
                    value: TimeFrames.DAY,
                    label: t(
                        'features_metrics_catalog_components.time_dimension_interval_picker.daily',
                    ),
                },
                {
                    value: TimeFrames.WEEK,
                    label: t(
                        'features_metrics_catalog_components.time_dimension_interval_picker.weekly',
                    ),
                },
                {
                    value: TimeFrames.MONTH,
                    label: t(
                        'features_metrics_catalog_components.time_dimension_interval_picker.monthly',
                    ),
                },
                {
                    value: TimeFrames.YEAR,
                    label: t(
                        'features_metrics_catalog_components.time_dimension_interval_picker.yearly',
                    ),
                },
            ]}
            value={optimisticInterval}
            onChange={(value: TimeFrames) => {
                if (!value) return;
                setOptimisticInterval(value);

                onChange({
                    interval: value,
                    field: dimension.field,
                    table: dimension.table,
                });
            }}
            withinPortal
            rightSection={
                <MantineIcon color="dark.2" icon={IconChevronDown} size={12} />
            }
            classNames={{
                input: classes.input,
                item: classes.item,
                rightSection: classes.rightSection,
            }}
        />
    );
};
