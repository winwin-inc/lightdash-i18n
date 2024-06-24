import {
    friendlyName,
    isChartValidationError,
    isDashboardValidationError,
    isTableValidationError,
    type ValidationResponse,
} from '@lightdash/common';
import { Mark, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

const CustomMark: FC<React.PropsWithChildren<{}>> = ({ children }) => (
    <Mark
        color="gray"
        px={2}
        fw={500}
        fz="xs"
        sx={{
            textTransform: 'none',
            borderRadius: '2px',
        }}
    >
        {children}
    </Mark>
);

const ErrorMessageByType: FC<{
    validationError: ValidationResponse;
}> = ({ validationError }) => {
    const { t } = useTranslation();

    if (isChartValidationError(validationError)) {
        return (
            <Text>
                <CustomMark>{validationError.fieldName}</CustomMark>
                {t(
                    'components_settings_validator_table.error.no_longer_exists',
                )}
            </Text>
        );
    }

    if (isDashboardValidationError(validationError)) {
        return (
            <Text>
                {validationError.fieldName ? (
                    <>
                        <CustomMark>{validationError.fieldName}</CustomMark>
                        {t(
                            'components_settings_validator_table.error.no_longer_exists',
                        )}
                    </>
                ) : (
                    <>
                        <CustomMark>{validationError.chartName}</CustomMark>
                        {t(
                            'components_settings_validator_table.error.is_broken',
                        )}
                    </>
                )}
            </Text>
        );
    }

    if (isTableValidationError(validationError) && validationError) {
        return <Text>{validationError.error}</Text>;
    }

    return null;
};

export const ErrorMessage: FC<{ validationError: ValidationResponse }> = ({
    validationError,
}) => {
    const { t } = useTranslation();

    return (
        <Stack spacing={4}>
            <Text fw={600} color="red.6" fz={11}>
                {validationError.errorType
                    ? friendlyName(validationError.errorType)
                    : ''}{' '}
                {t('components_settings_validator_table.error.error')}
            </Text>
            <ErrorMessageByType validationError={validationError} />
        </Stack>
    );
};
