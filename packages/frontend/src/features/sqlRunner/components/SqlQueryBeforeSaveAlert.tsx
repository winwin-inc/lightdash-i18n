import { Alert, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';

export const SqlQueryBeforeSaveAlert: FC<{ withDescription?: boolean }> = ({
    withDescription = true,
}) => {
    const { t } = useTranslation();

    return (
        <Alert
            icon={<MantineIcon icon={IconAlertCircle} color="yellow" />}
            color="yellow"
            title={t('features_sql_runner_before_save_alert.title')}
        >
            {withDescription && (
                <Text fw={500} size="xs">
                    {t('features_sql_runner_before_save_alert.content')}
                </Text>
            )}
        </Alert>
    );
};
