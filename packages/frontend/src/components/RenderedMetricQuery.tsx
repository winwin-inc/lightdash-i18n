import { Loader, Stack, Title } from '@mantine/core';
import Editor, {
    type BeforeMount,
    type EditorProps,
} from '@monaco-editor/react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    selectMetricQuery,
    selectTableName,
    useExplorerSelector,
} from '../features/explorer/store';
import {
    LIGHTDASH_THEME,
    MONACO_DEFAULT_OPTIONS,
} from '../features/sqlRunner/utils/monaco';

const MONACO_READ_ONLY: EditorProps['options'] = {
    ...MONACO_DEFAULT_OPTIONS,
    readOnly: true,
};

export const RenderedMetricQuery = () => {
    const { t } = useTranslation();
    const tableName = useExplorerSelector(selectTableName);
    const metricQuery = useExplorerSelector(selectMetricQuery);

    const formattedJson = useMemo(() => {
        if (!tableName) return '';
        return JSON.stringify(metricQuery, null, 2);
    }, [metricQuery, tableName]);

    const beforeMount: BeforeMount = useCallback((monaco) => {
        monaco.editor.defineTheme('lightdash', {
            base: 'vs',
            inherit: true,
            ...LIGHTDASH_THEME,
        });
    }, []);

    if (!tableName) {
        return null;
    }

    if (!formattedJson) {
        return (
            <Stack my="xs" align="center">
                <Loader size="lg" color="gray" mt="xs" />
                <Title order={4} fw={500} color="gray.7">
                    {t('components_rendered_metric_query.loading')}
                </Title>
            </Stack>
        );
    }

    return (
        <Editor
            loading={<Loader color="gray" size="xs" />}
            language="json"
            beforeMount={beforeMount}
            value={formattedJson}
            options={MONACO_READ_ONLY}
            theme="lightdash"
        />
    );
};
