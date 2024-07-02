import { IconReload } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useHealth from '../../hooks/health/useHealth';
import useToaster from '../../hooks/toaster/useToaster';

const VersionAutoUpdater: FC = () => {
    const { t } = useTranslation();

    const [version, setVersion] = useState<string>();
    const { showToastPrimary } = useToaster();
    const { data: healthData } = useHealth({
        refetchInterval: 1200000, // 20 minutes in milliseconds
    });

    useEffect(() => {
        if (healthData) {
            if (!version) {
                setVersion(healthData.version);
            } else if (version !== healthData.version) {
                showToastPrimary({
                    key: 'new-version-available',
                    autoClose: false,
                    title: t('components_version_auto_updater.title'),
                    action: {
                        children: 'Use new version',
                        icon: IconReload,
                        onClick: () => window.location.reload(),
                    },
                });
            }
        }
    }, [version, healthData, showToastPrimary, t]);

    return null;
};
export default VersionAutoUpdater;
