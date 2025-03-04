import { Box, Flex, Text, type FlexProps } from '@mantine/core';
import { Prism } from '@mantine/prism';
import * as Sentry from '@sentry/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';

const ErrorBoundary: FC<PropsWithChildren & { wrapper?: FlexProps }> = ({
    children,
    wrapper,
}) => {
    const { t } = useTranslation();

    return (
        <Sentry.ErrorBoundary
            fallback={({ eventId, error }) => (
                <Flex
                    justify="flex-start"
                    align="center"
                    direction="column"
                    {...wrapper}
                >
                    <SuboptimalState
                        icon={IconAlertCircle}
                        title={t(
                            'features_error_boundary.something_went_wrong',
                        )}
                        description={
                            <Box
                                sx={(theme) => ({
                                    borderRadius: theme.radius.md,
                                    padding: theme.spacing.xs,
                                    backgroundColor: theme.colors.gray[1],
                                })}
                            >
                                <Text>
                                    {t('features_error_boundary.tip.part_1')}
                                </Text>
                                <Prism
                                    language="javascript"
                                    ta="left"
                                    maw="400"
                                    styles={{ copy: { right: 0 } }}
                                >
                                    {`${t(
                                        'features_error_boundary.tip.part_2',
                                    )}: ${eventId}\n${
                                        error instanceof Error
                                            ? error.toString()
                                            : ''
                                    }`}
                                </Prism>
                            </Box>
                        }
                    />
                </Flex>
            )}
        >
            {children}
        </Sentry.ErrorBoundary>
    );
};

export default ErrorBoundary;
