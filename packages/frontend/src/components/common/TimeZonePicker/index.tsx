import { getTimezoneLabel, TimeZone } from '@lightdash/common';
import { Select, type SelectProps } from '@mantine-8/core';
import dayjs from 'dayjs';
import { useMemo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

export interface TimeZonePickerProps extends Omit<SelectProps, 'data'> {}

const TimeZonePicker: FC<TimeZonePickerProps> = (props) => {
    const { t } = useTranslation();
    const localSuffix = t('components_common_timezone_picker.local');
    const timeZoneOptions = useMemo(
        () =>
            Object.keys(TimeZone)
                .filter((key) => isNaN(Number(key)))
                .map((key) => {
                    let labelText = getTimezoneLabel(key) || key;

                    labelText =
                        dayjs.tz.guess() === key
                            ? `${labelText} - ${localSuffix}`
                            : labelText;

                    return { label: labelText, value: key };
                }),
        [localSuffix],
    );

    return (
        <Select
            variant="filled"
            maw={190}
            size="xs"
            placeholder={t('components_common_timezone_picker.placeholder')}
            data={timeZoneOptions}
            {...props}
        />
    );
};

export default TimeZonePicker;
