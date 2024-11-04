import {
    Alert,
    Button,
    Modal,
    Stack,
    Text,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../../../components/common/MantineIcon';

type Props = ModalProps & {
    onFixButtonClick: () => void;
};

export const ChartErrorsAlert: FC<Props> = ({
    opened,
    onClose,
    onFixButtonClick,
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={null}
            p={0}
            styles={{
                header: {
                    display: 'none',
                },
                body: {
                    padding: 0,
                },
            }}
        >
            <Alert
                icon={<MantineIcon icon={IconAlertCircle} color="red" />}
                color="red"
                title={t('features_sql_runner_alert.title')}
            >
                <Stack spacing="xs">
                    <Text fw={500} size="xs">
                        {t('features_sql_runner_alert.content.part_1')}
                    </Text>
                    <Button
                        ml="auto"
                        size="xs"
                        variant="default"
                        onClick={onFixButtonClick}
                    >
                        {t('features_sql_runner_alert.content.part_2')}
                    </Button>
                </Stack>
            </Alert>
        </Modal>
    );
};
