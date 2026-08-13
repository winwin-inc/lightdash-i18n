import { Anchor, Avatar, Button } from '@mantine/core';
import { IconChevronLeft, IconExclamationCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '../../common/EmptyState';
import MantineIcon from '../../common/MantineIcon';
import { ProjectCreationCard } from '../../common/Settings/SettingsCard';
import OnboardingWrapper from './common/OnboardingWrapper';

interface UnsupportedWarehouseProps {
    onBack: () => void;
}

const UnsupportedWarehouse: FC<UnsupportedWarehouseProps> = ({ onBack }) => {
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
                />
            </ProjectCreationCard>
        </OnboardingWrapper>
    );
};
export default UnsupportedWarehouse;
