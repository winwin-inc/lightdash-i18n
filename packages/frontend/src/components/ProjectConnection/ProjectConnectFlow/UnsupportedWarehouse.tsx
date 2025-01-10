import { Anchor, Avatar, Button } from '@mantine/core';
import { IconChevronLeft, IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingWrapper from './common/OnboardingWrapper';

interface UnsupportedWarehouseProps {
    onBack: () => void;
}

const UnsupportedWarehouse: FC<UnsupportedWarehouseProps> = ({ onBack }) => {
    const { track } = useTracking();
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
                {t('components_project_connection_flow.unsupported.back')}
            </Button>

            <ProjectCreationCard>
                <EmptyState
                    py="unset"
                    icon={
                        <Avatar size="lg" radius="xl">
                            <MantineIcon
                                icon={IconExclamationCircle}
                                size="xxl"
                                strokeWidth={1.5}
                                color="black"
                            />
                        </Avatar>
                    }
                    title={
                        <>
                            {t(
                                'components_project_connection_flow.unsupported.content.part_1',
                            )}{' '}
                            <Anchor
                                href="https://docs.getdbt.com/docs/supported-data-platforms#verified-adapters"
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                {t(
                                    'components_project_connection_flow.unsupported.content.part_2',
                                )}
                            </Anchor>{' '}
                            {t(
                                'components_project_connection_flow.unsupported.content.part_3',
                            )}
                        </>
                    }
                    description={
                        <>
                            {t(
                                'components_project_connection_flow.unsupported.content.part_4',
                            )}{' '}
                            <Anchor
                                href="https://github.com/lightdash/lightdash/issues"
                                target="_blank"
                                rel="noreferrer noopener"
                            >
                                {t(
                                    'components_project_connection_flow.unsupported.content.part_5',
                                )}
                            </Anchor>{' '}
                            {t(
                                'components_project_connection_flow.unsupported.content.part_6',
                            )}
                        </>
                    }
                >
                    <Button
                        component="a"
                        href="https://demo.lightdash.com/"
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={() => {
                            track({ name: EventName.TRY_DEMO_CLICKED });
                        }}
                    >
                        {t(
                            'components_project_connection_flow.unsupported.try_our_demo_project',
                        )}
                    </Button>
                </EmptyState>
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};
export default UnsupportedWarehouse;
