import { Button, Stack, Text, Tooltip } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useTracking } from '../../../../providers/TrackingProvider';
import { EventName } from '../../../../types/Events';
import MantineIcon from '../../../common/MantineIcon';
import { ProjectCreationCard } from '../../../common/Settings/SettingsCard';
import { OnboardingConnectTitle } from '../common/OnboardingTitle';
import OnboardingWrapper from '../common/OnboardingWrapper';

const codeBlock = String.raw`
models:
  - name: my_model
    columns:
      - name: my_column_1
      - name: my_column_2
`;

interface ConnectManuallyStep1Props {
    isCreatingFirstProject: boolean;
    onBack: () => void;
    onForward: () => void;
}

const ConnectManuallyStep1: FC<ConnectManuallyStep1Props> = ({
    isCreatingFirstProject,
    onBack,
    onForward,
}) => {
    const { t } = useTranslation();
    const { track } = useTracking();

    return (
        <OnboardingWrapper>
            <Button
                pos="absolute"
                variant="subtle"
                size="sm"
                top={-50}
                leftIcon={<MantineIcon icon={IconChevronLeft} />}
                onClick={onBack}
            >
                {t(
                    'components_project_connection_flow.connect_manually_step_1.back',
                )}
            </Button>

            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text color="dimmed">
                        {t(
                            'components_project_connection_flow.connect_manually_step_1.content.part_1',
                        )}
                    </Text>

                    <Prism ta="left" noCopy language="yaml">
                        {codeBlock}
                    </Prism>

                    <Stack spacing="xs">
                        <Tooltip
                            position="top"
                            label={t(
                                'components_project_connection_flow.connect_manually_step_1.content.part_2',
                            )}
                        >
                            <Button
                                component="a"
                                variant="outline"
                                href="https://docs.lightdash.com/guides/how-to-create-dimensions"
                                target="_blank"
                                rel="noreferrer noopener"
                                rightIcon={
                                    <MantineIcon icon={IconChevronRight} />
                                }
                                onClick={() => {
                                    track({
                                        name: EventName.DOCUMENTATION_BUTTON_CLICKED,
                                        properties: {
                                            action: 'define_metrics',
                                        },
                                    });
                                }}
                            >
                                {t(
                                    'components_project_connection_flow.connect_manually_step_1.content.part_3',
                                )}
                            </Button>
                        </Tooltip>

                        <Button onClick={onForward}>
                            {t(
                                'components_project_connection_flow.connect_manually_step_1.content.part_4',
                            )}
                        </Button>
                    </Stack>
                </Stack>
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};

export default ConnectManuallyStep1;
