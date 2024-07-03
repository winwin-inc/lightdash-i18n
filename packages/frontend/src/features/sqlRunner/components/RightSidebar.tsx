import { ActionIcon, Group, Stack, Title, Tooltip } from '@mantine/core';
import { IconLayoutSidebarRightCollapse } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const RightSidebar: FC<Props> = ({ setSidebarOpen }) => {
    const { t } = useTranslation();

    return (
        <Stack h="100vh" spacing="xs">
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    {t('features_sql_runner_right_sidebar.configure_chart')}
                </Title>
                <Tooltip
                    variant="xs"
                    label={t('features_sql_runner_right_sidebar.close_sidebar')}
                    position="left"
                >
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconLayoutSidebarRightCollapse}
                            onClick={() => setSidebarOpen(false)}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>
            {t('features_sql_runner_right_sidebar.todo_form')}
        </Stack>
    );
};
