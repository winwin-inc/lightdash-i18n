import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconChartBar } from '@tabler/icons-react';
import { useEffect, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';
import { useDeleteSqlChartMutation } from '../hooks/useSavedSqlCharts';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    savedSqlUuid: string;
    name: string;
    onSuccess: () => void;
};

export const DeleteSqlChartModal: FC<Props> = ({
    projectUuid,
    savedSqlUuid,
    name,
    opened,
    onClose,
    onSuccess,
}) => {
    const { t } = useTranslation();

    const { mutate, isLoading, isSuccess } = useDeleteSqlChartMutation(
        projectUuid,
        savedSqlUuid,
    );

    useEffect(() => {
        if (isSuccess) {
            onSuccess();
        }
    }, [isSuccess, onClose, onSuccess]);

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={500}>
                        {t('features_sql_runner_delete_sql_chart_modal.title')}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
            })}
        >
            <Stack pt="sm">
                <Text>
                    {t('features_sql_runner_delete_sql_chart_modal.content', {
                        name,
                    })}
                </Text>

                <Group position="right" mt="sm">
                    <Button color="dark" variant="outline" onClick={onClose}>
                        {t('features_sql_runner_delete_sql_chart_modal.cancel')}
                    </Button>

                    <Button
                        loading={isLoading}
                        color="red"
                        onClick={() => mutate()}
                    >
                        {t('features_sql_runner_delete_sql_chart_modal.delete')}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
