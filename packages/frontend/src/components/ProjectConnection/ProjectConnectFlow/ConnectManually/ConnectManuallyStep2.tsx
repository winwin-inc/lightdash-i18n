import { type WarehouseTypes } from '@lightdash/common';
import { Button, Stack } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateProjectConnection } from '../..';
import MantineIcon from '../../../common/MantineIcon';
import { OnboardingTitle } from '../common/OnboardingTitle';
import { getWarehouseLabel } from '../utils';

interface ConnectManuallyStep2Props {
    isCreatingFirstProject: boolean;
    selectedWarehouse: WarehouseTypes;
    onBack: () => void;
}

const ConnectManuallyStep2: FC<ConnectManuallyStep2Props> = ({
    isCreatingFirstProject,
    selectedWarehouse,
    onBack,
}) => {
    const { t } = useTranslation();

    return (
        <>
            <Stack align="left">
                <Button
                    variant="subtle"
                    size="sm"
                    leftIcon={<MantineIcon icon={IconChevronLeft} />}
                    onClick={onBack}
                    sx={{ alignSelf: 'flex-start' }}
                >
                    {t(
                        'components_project_connection_flow.connect_manually_step_2.back',
                    )}
                </Button>

                <OnboardingTitle>
                    {t(
                        'components_project_connection_flow.connect_manually_step_2.content.part_1',
                    )}{' '}
                    {getWarehouseLabel(selectedWarehouse)}{' '}
                    {t(
                        'components_project_connection_flow.connect_manually_step_2.content.part_2',
                    )}
                </OnboardingTitle>

                <CreateProjectConnection
                    isCreatingFirstProject={isCreatingFirstProject}
                    selectedWarehouse={selectedWarehouse}
                />
            </Stack>
        </>
    );
};

export default ConnectManuallyStep2;
