import { Button, Stack, Text } from '@mantine/core';
import { Prism } from '@mantine/prism';
import { IconChevronLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

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
