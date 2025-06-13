import { Anchor, Code, Stepper } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import { useGetSlack } from '../../../../hooks/slack/useSlack';

export const SlackIntegrationSteps: FC<{
    slackInstallation: boolean;
    channelsConfigured: boolean;
}> = (props) => {
    const { t } = useTranslation();

    const { data } = useGetSlack();
    const active = props.channelsConfigured
        ? 2
        : props.slackInstallation
        ? 1
        : 0;
    return (
        <Stepper active={active} size="xs" orientation="horizontal">
            <Stepper.Step
                label="Allow integration access"
                description={
                    active === 0 ? (
                        <Anchor
                            component={Link}
                            to="/generalSettings/integrations"
                            variant="link"
                            size="sm"
                        >
                            {t(
                                'features_ai_copilot_slack_integration_steps.connect_slack',
                            )}
                        </Anchor>
                    ) : null
                }
            />
            <Stepper.Step
                label="Select channels"
                description={
                    active === 1
                        ? t(
                              'features_ai_copilot_slack_integration_steps.select_channels.description',
                          )
                        : null
                }
            />
            <Stepper.Step
                label={t(
                    'features_ai_copilot_slack_integration_steps.start_using_agent.label',
                )}
                description={
                    active === 2 ? (
                        <>
                            {t(
                                'features_ai_copilot_slack_integration_steps.start_using_agent.description.part_1',
                            )}{' '}
                            {data?.appName ? (
                                <>
                                    <Code fw={500} c="blue" fz={10}>
                                        @{data?.appName}
                                    </Code>{' '}
                                    {t(
                                        'features_ai_copilot_slack_integration_steps.start_using_agent.description.part_2',
                                    )}
                                </>
                            ) : (
                                t(
                                    'features_ai_copilot_slack_integration_steps.start_using_agent.description.part_2',
                                )
                            )}
                        </>
                    ) : null
                }
            />
        </Stepper>
    );
};
