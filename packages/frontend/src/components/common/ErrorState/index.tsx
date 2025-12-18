import { type ApiErrorDetail } from '@lightdash/common';
import { Text } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconAlertCircle, IconLock } from '@tabler/icons-react';
import React, { useMemo, type ComponentProps, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import SuboptimalState from '../SuboptimalState/SuboptimalState';

const useDefaultErrorProps = () => {
    const { t } = useTranslation();
    return {
        icon: IconAlertCircle,
        title: t('components_common_error_state.error_props.title'),
        description: t('components_common_error_state.error_props.description'),
    };
};

const ErrorState: FC<{
    error?: ApiErrorDetail | null;
    hasMarginTop?: boolean;
}> = ({ error, hasMarginTop = true }) => {
    const { t } = useTranslation();
    const defaultErrorProps = useDefaultErrorProps();

    const props = useMemo<ComponentProps<typeof SuboptimalState>>(() => {
        if (!error) {
            return defaultErrorProps;
        }
        // Hide generic network connectivity errors (e.g. "unable to reach server")
        if (error.name === 'NetworkError') {
            return defaultErrorProps;
        }
        try {
            const description = (
                <>
                    <Text maw={400}>{error.message}</Text>
                    {(error.sentryEventId || error.sentryTraceId) && (
                        <>
                            <Text maw={400} weight="bold">
                                {t('components_common_error_state.description')}
                            </Text>
                            <Prism ta="left" language="yaml" pr="lg">
                                {`\n${t(
                                    'components_common_error_state.error_id',
                                )}: ${error.sentryEventId || 'n/a'}\n${t(
                                    'components_common_error_state.trace_id',
                                )}: ${error.sentryTraceId || 'n/a'}`}
                            </Prism>
                        </>
                    )}
                </>
            );
            switch (error.name) {
                case 'ForbiddenError':
                    return {
                        icon: IconLock,
                        title: t(
                            'components_common_error_state.errors.need_access',
                        ),
                        description,
                    };
                case 'AuthorizationError':
                    return {
                        icon: IconLock,
                        title: t(
                            'components_common_error_state.errors.authorization_error',
                        ),
                        description,
                    };
                case 'NotExistsError':
                    return {
                        icon: IconAlertCircle,
                        title: t(
                            'components_common_error_state.errors.not_found',
                        ),
                        description,
                    };
                default:
                    return {
                        ...defaultErrorProps,
                        description,
                    };
            }
        } catch {
            return defaultErrorProps;
        }
    }, [error, defaultErrorProps, t]);

    return (
        <SuboptimalState
            sx={{ marginTop: hasMarginTop ? '20px' : undefined }}
            {...props}
        />
    );
};

export default ErrorState;
