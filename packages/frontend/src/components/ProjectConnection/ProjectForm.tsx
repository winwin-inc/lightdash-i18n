import { type DbtProjectType } from '@lightdash/common';
import { Avatar, Flex, Stack, Text, TextInput, Title } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useApp from '../../providers/App/useApp';
import DocumentationHelpButton from '../DocumentationHelpButton';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import DbtSettingsForm from './DbtSettingsForm';
import DbtLogo from './ProjectConnectFlow/Assets/dbt.svg';
import { getWarehouseIcon } from './ProjectConnectFlow/utils';
import WarehouseSettingsForm from './WarehouseSettingsForm';
import { useFormContext } from './formContext';

interface Props {
    showGeneralSettings: boolean;
    disabled: boolean;
    defaultType?: DbtProjectType;
    isProjectUpdate?: boolean;
}

export const ProjectForm: FC<Props> = ({
    showGeneralSettings,
    disabled,
    defaultType,
    isProjectUpdate,
}) => {
    const { health } = useApp();
    const form = useFormContext();
    const { t } = useTranslation();

    const warehouse = form.values.warehouse?.type;

    return (
        <Stack spacing="xl">
            {showGeneralSettings && (
                <SettingsGridCard>
                    <div>
                        <Title order={5}>
                            {t(
                                'components_project_connection.generate_settings.title',
                            )}
                        </Title>
                    </div>

                    <div>
                        <TextInput
                            name="name"
                            label={t(
                                'components_project_connection.generate_settings.project_name',
                            )}
                            required
                            disabled={disabled}
                            {...form.getInputProps('name')}
                        />
                    </div>
                </SettingsGridCard>
            )}

            <SettingsGridCard>
                <div>
                    {warehouse && getWarehouseIcon(warehouse)}
                    <Flex align="center" gap={2}>
                        <Title order={5}>
                            {t('components_project_connection.warehouse.title')}
                        </Title>
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project#warehouse-connection"
                            pos="relative"
                            top="2px"
                        />
                    </Flex>

                    {health.data?.staticIp && (
                        <Text color="gray">
                            {t(
                                'components_project_connection.warehouse.static_ip',
                            )}
                            <b>{health.data?.staticIp}</b>
                        </Text>
                    )}
                </div>

                <div>
                    <WarehouseSettingsForm
                        disabled={disabled}
                        isProjectUpdate={isProjectUpdate}
                    />
                </div>
            </SettingsGridCard>

            <SettingsGridCard>
                <div>
                    <Avatar size="md" src={DbtLogo} alt="dbt icon" />

                    <Flex align="center" gap={2}>
                        <Title order={5}>
                            {t(
                                'components_project_connection.dbt_connection.title',
                            )}
                        </Title>
                        <DocumentationHelpButton
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project"
                            pos="relative"
                            top="2px"
                        />
                    </Flex>
                </div>

                <div>
                    <DbtSettingsForm
                        disabled={disabled}
                        defaultType={defaultType}
                    />
                </div>
            </SettingsGridCard>
        </Stack>
    );
};
