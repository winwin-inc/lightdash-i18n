import { subject } from '@casl/ability';
import { Group, Stack, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { EventName } from '../../../types/Events';
import MantineLinkButton from '../../common/MantineLinkButton';

interface Props {
    userName: string | undefined;
    projectUuid: string;
    isCustomerUse: boolean;
}

const LandingPanel: FC<Props> = ({ userName, projectUuid, isCustomerUse }) => {
    const { user } = useApp();
    const { t } = useTranslation();

    return (
        <Group position="apart" my="xl">
            <Stack justify="flex-start" spacing="xs">
                <Title order={3}>
                    {`${t('welcome.part_1')}${
                        userName ? ', ' + userName : ''
                    }${t('welcome.part_2')}!`}{' '}
                    ⚡️
                </Title>
                {!isCustomerUse && (
                    <Text color="gray.7">
                        {' '}
                        {t('components_landing_panel.tip')}{' '}
                    </Text>
                )}
            </Stack>
            <Can
                I="manage"
                this={subject('Explore', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid: projectUuid,
                })}
            >
                <MantineLinkButton
                    href={`/projects/${projectUuid}/tables`}
                    trackingEvent={{
                        name: EventName.LANDING_RUN_QUERY_CLICKED,
                        properties: {
                            organizationId: user.data?.organizationUuid || '',
                            projectId: projectUuid,
                        },
                    }}
                >
                    {t('components_landing_panel.query')}
                </MantineLinkButton>
            </Can>
        </Group>
    );
};

export default LandingPanel;
