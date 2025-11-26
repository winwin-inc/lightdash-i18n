import { Button } from '@mantine/core';
import { IconBrandSlack } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { EmptyState } from '../../components/common/EmptyState';
import MantineIcon from '../../components/common/MantineIcon';

export const SlackAuthSuccess = () => {
    const [searchParams] = useSearchParams();
    const { t } = useTranslation();

    const slackUrl = useMemo(() => {
        const team = searchParams.get('team');
        const channel = searchParams.get('channel');
        const message = searchParams.get('message');
        const threadTs = searchParams.get('thread_ts');

        if (team && channel) {
            let url = `slack://channel?team=${team}&id=${channel}`;

            if (message) {
                url += `&message=${message}`;

                if (threadTs) {
                    url += `&thread_ts=${threadTs}`;
                }
            }

            return url;
        }

        return 'slack://open';
    }, [searchParams]);

    return (
        <EmptyState
            icon={
                <MantineIcon
                    icon={IconBrandSlack}
                    color="green.6"
                    stroke={1}
                    size="5xl"
                />
            }
            title={t('pages_slack_auth_success.title')}
            description={t('pages_slack_auth_success.description')}
        >
            <Button onClick={() => window.open(slackUrl)}>
                {t('pages_slack_auth_success.open_slack')}
            </Button>
        </EmptyState>
    );
};
