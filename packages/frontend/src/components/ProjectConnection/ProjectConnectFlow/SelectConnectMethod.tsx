import { Avatar, Button, Stack, Text } from '@mantine/core';
import {
    IconChecklist,
    IconChevronLeft,
    IconChevronRight,
    IconTerminal,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { ConnectMethod } from '../../../pages/CreateProject';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingButton from './common/OnboardingButton';
import { OnboardingConnectTitle } from './common/OnboardingTitle';
import OnboardingWrapper from './common/OnboardingWrapper';

interface SelectConnectMethodProps {
    isCreatingFirstProject: boolean;
    onBack: () => void;
    onSelect: (method: ConnectMethod) => void;
}

const SelectConnectMethod: FC<SelectConnectMethodProps> = ({
    isCreatingFirstProject,
    onSelect,
    onBack,
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
                    'components_project_connection_flow.select_connect_method.back',
                )}
            </Button>

            <ProjectCreationCard>
                <Stack>
                    <OnboardingConnectTitle
                        isCreatingFirstProject={isCreatingFirstProject}
                    />

                    <Text color="dimmed">
                        {t(
                            'components_project_connection_flow.select_connect_method.content.part_1',
                        )}
                    </Text>

                    <Stack>
                        <OnboardingButton
                            onClick={() => {
                                track({
                                    name: EventName.CREATE_PROJECT_CLI_BUTTON_CLICKED,
                                });
                                onSelect(ConnectMethod.CLI);
                            }}
                            leftIcon={
                                <Avatar radius="xl">
                                    <MantineIcon
                                        icon={IconTerminal}
                                        color="black"
                                        size="lg"
                                    />
                                </Avatar>
                            }
                            rightIcon={
                                <MantineIcon
                                    icon={IconChevronRight}
                                    color="black"
                                />
                            }
                            description={
                                <>
                                    {t(
                                        'components_project_connection_flow.select_connect_method.content.part_2',
                                    )}{' '}
                                    <Text span ff="monospace">
                                        `
                                        {t(
                                            'components_project_connection_flow.select_connect_method.content.part_3',
                                        )}
                                        `
                                    </Text>
                                </>
                            }
                        >
                            {t(
                                'components_project_connection_flow.select_connect_method.content.part_4',
                            )}
                        </OnboardingButton>

                        <OnboardingButton
                            onClick={() => {
                                track({
                                    name: EventName.CREATE_PROJECT_MANUALLY_BUTTON_CLICKED,
                                });
                                onSelect(ConnectMethod.MANUAL);
                            }}
                            leftIcon={
                                <Avatar radius="xl">
                                    <MantineIcon
                                        icon={IconChecklist}
                                        color="black"
                                        size="lg"
                                    />
                                </Avatar>
                            }
                            rightIcon={
                                <MantineIcon
                                    icon={IconChevronRight}
                                    color="black"
                                />
                            }
                            description={t(
                                'components_project_connection_flow.select_connect_method.content.part_5',
                            )}
                        >
                            {t(
                                'components_project_connection_flow.select_connect_method.content.part_6',
                            )}
                        </OnboardingButton>
                    </Stack>
                </Stack>
            </ProjectCreationCard>

            <Button
                component="a"
                variant="subtle"
                mx="auto"
                w="fit-content"
                target="_blank"
                rel="noreferrer noopener"
                href="https://docs.lightdash.com/get-started/setup-lightdash/get-project-lightdash-ready"
                onClick={() => {
                    track({
                        name: EventName.DOCUMENTATION_BUTTON_CLICKED,
                        properties: {
                            action: 'getting_started',
                        },
                    });
                }}
            >
                {t(
                    'components_project_connection_flow.select_connect_method.view_docs',
                )}
            </Button>
        </OnboardingWrapper>
    );
};

export default SelectConnectMethod;
