import { Stack, Text, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useParams } from 'react-router-dom';

import Page from '../components/common/Page/Page';
import PageSpinner from '../components/PageSpinner';
import ProjectTablesConfiguration from '../components/ProjectTablesConfiguration/ProjectTablesConfiguration';
import { useApp } from '../providers/AppProvider';

const CreateProjectSettings: FC = () => {
    const { t } = useTranslation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const queryClient = useQueryClient();
    const history = useHistory();
    const { health } = useApp();
    if (health.isInitialLoading) {
        return <PageSpinner />;
    }

    const onSuccess = async () => {
        await queryClient.invalidateQueries(['health']);
        await queryClient.refetchQueries(['organization']);
        history.push({
            pathname: `/projects/${projectUuid}/home`,
        });
    };

    return (
        <Page withFixedContent withPaddedContent>
            <Stack pt={60}>
                <Stack spacing="xxs">
                    <Title order={3} fw={500}>
                        {t('pages_create_project_settings.title')} 🎉{' '}
                    </Title>

                    <Text color="dimmed">
                        {t('pages_create_project_settings.content')}
                    </Text>
                </Stack>

                <ProjectTablesConfiguration
                    projectUuid={projectUuid}
                    onSuccess={onSuccess}
                />
            </Stack>
        </Page>
    );
};

export default CreateProjectSettings;
