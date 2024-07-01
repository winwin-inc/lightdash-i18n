import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import MantineIcon from '../MantineIcon';

interface Props extends ModalProps {
    name: string;
    onConfirm: () => void;
}

const DeleteChartTileThatBelongsToDashboardModal: FC<Props> = ({
    name,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();

    return (
        <Modal
            size="md"
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>
                        {t(
                            'components_common_modal_chart_delete_belongs_dashboard.delete_chart',
                        )}
                    </Title>
                </Group>
            }
            {...modalProps}
        >
            <Stack>
                <Text>
                    {t(
                        'components_common_modal_chart_delete_belongs_dashboard.content.part_1',
                    )}
                    <b>{name}</b>?
                </Text>
                <Text>
                    {t(
                        'components_common_modal_chart_delete_belongs_dashboard.content.part_2',
                    )}
                </Text>

                <Group position="right" spacing="xs">
                    <Button
                        variant="outline"
                        color="dark"
                        onClick={modalProps.onClose}
                    >
                        {t(
                            'components_common_modal_chart_delete_belongs_dashboard.cancel',
                        )}
                    </Button>

                    <Button color="red" onClick={onConfirm} type="submit">
                        {t(
                            'components_common_modal_chart_delete_belongs_dashboard.delete',
                        )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default DeleteChartTileThatBelongsToDashboardModal;
