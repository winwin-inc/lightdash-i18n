import { Alert, Loader, Stack, Title } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { useCompiledSql } from '../hooks/useCompiledSql';

export const RenderedSql = () => {
    const { t } = useTranslation();
    const { data, error, isInitialLoading } = useCompiledSql();

    if (isInitialLoading) {
        return (
            <Stack my="xs" align="center">
                <Loader size="lg" color="gray" mt="xs" />
                <Title order={4} fw={500} color="gray.7">
                    {t('components_rendered_sql.compiling_sql')}
                </Title>
            </Stack>
        );
    }

    if (error?.error.message) {
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t('components_rendered_sql.compilation_error')}
                    color="red"
                    variant="filled"
                >
                    <p>{error.error.message}</p>
                </Alert>
            </div>
        );
    } else if (error?.error.data) {
        // Validation error
        return (
            <div style={{ margin: 10 }}>
                <Alert
                    icon={<IconAlertCircle size="1rem" />}
                    title={t('components_rendered_sql.compilation_error')}
                    color="red"
                    variant="filled"
                >
                    {Object.entries(error.error.data).map(
                        ([key, validation]) => {
                            return (
                                <p key={key}>{JSON.stringify(validation)}</p>
                            );
                        },
                    )}
                </Alert>
            </div>
        );
    }

    return (
        <Prism m="sm" language="sql" withLineNumbers>
            {data?.query || ''}
        </Prism>
    );
};
