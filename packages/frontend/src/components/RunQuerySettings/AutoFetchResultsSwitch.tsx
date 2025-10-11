import { Switch, Tooltip, type MantineSize } from '@mantine-8/core';
import { useLocalStorage } from '@mantine-8/hooks';
import { memo, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTO_FETCH_ENABLED_DEFAULT, AUTO_FETCH_ENABLED_KEY } from './defaults';

const AutoFetchResultsSwitch: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const { t } = useTranslation();

    const [autoFetchEnabled, setAutoFetchEnabled] = useLocalStorage({
        key: AUTO_FETCH_ENABLED_KEY,
        defaultValue: AUTO_FETCH_ENABLED_DEFAULT,
    });

    return (
        <Tooltip
            label={t(
                'components_run_query_settings.automatically_rerun_query_on_change',
            )}
            position="bottom"
            refProp="rootRef"
            withArrow
            withinPortal
        >
            <Switch
                size={size}
                label={t('components_run_query_settings.auto_fetch_results')}
                checked={autoFetchEnabled}
                onChange={() => setAutoFetchEnabled(!autoFetchEnabled)}
                // This removes the thumb icon from the switch
                thumbIcon={<></>}
            />
        </Tooltip>
    );
});

export default AutoFetchResultsSwitch;
