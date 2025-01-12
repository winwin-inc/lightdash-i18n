import { type ValidationResponse } from '@lightdash/common';
import { Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useTimeAgo } from '../../../hooks/useTimeAgo';
import LargeMenuItem from '../../common/LargeMenuItem';

const ValidationErrorNotificationDescription: FC<{
    lastValidatedAt: Date;
    numberOfErrors: number;
}> = ({ lastValidatedAt, numberOfErrors }) => {
    const validationTimeAgo = useTimeAgo(lastValidatedAt);
    const { t } = useTranslation();

    return (
        <Text>
            {t(
                'components_navbar_notifiications_menu.validation_error_notification_tip',
                { validationTimeAgo, numberOfErrors },
            )}
        </Text>
    );
};

export const ValidationErrorNotification: FC<{
    projectUuid: string;
    validationData: ValidationResponse[];
}> = ({ projectUuid, validationData }) => {
    const { t } = useTranslation();

    return (
        <LargeMenuItem
            component={Link}
            to={`/generalSettings/projectManagement/${projectUuid}/validator`}
            title={t('components_navbar_notifiications_menu.validation_errors')}
            description={
                <ValidationErrorNotificationDescription
                    lastValidatedAt={validationData[0].createdAt}
                    numberOfErrors={validationData.length}
                />
            }
            icon={IconAlertCircle}
            iconProps={{ color: 'red' }}
        />
    );
};
