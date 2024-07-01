import {
    Button,
    Flex,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { IconFolders } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useMoveChartMutation } from '../../../hooks/useSavedQuery';
import MantineIcon from '../MantineIcon';

interface Props extends ModalProps {
    uuid: string;
    name: string;
    spaceUuid: string;
    spaceName: string;
    onConfirm: () => void;
}

const MoveChartThatBelongsToDashboardModal: FC<Props> = ({
    uuid,
    name,
    spaceUuid,
    spaceName,
    onConfirm,
    ...modalProps
}) => {
    const { t } = useTranslation();
    const { mutate: moveChartToSpace } = useMoveChartMutation({
        onSuccess: async () => {
            onConfirm();
            modalProps.onClose();
        },
    });

    return (
        <Modal
            size="lg"
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon icon={IconFolders} size="lg" />
                    <Title order={5}>
                        <Text span fw={400}>
                            {t(
                                'components_common_modal_chart_move_belongs_dashboard.cancel',
                            )}{' '}
                        </Text>
                        {name}
                    </Title>
                </Flex>
            }
            {...modalProps}
        >
            <Stack mt="sm">
                <Text>
                    {t(
                        'components_common_modal_chart_move_belongs_dashboard.content.part_1',
                    )}{' '}
                    <Text fw={600} span>
                        {name}
                    </Text>{' '}
                    {t(
                        'components_common_modal_chart_move_belongs_dashboard.content.part_2',
                    )}{' '}
                    <Text fw={600} span>
                        {spaceName}
                    </Text>
                    ?
                </Text>
                <Text>
                    {t(
                        'components_common_modal_chart_move_belongs_dashboard.content.part_3',
                    )}
                </Text>
                <Text fw={600}>
                    {t(
                        'components_common_modal_chart_move_belongs_dashboard.content.part_4',
                    )}
                </Text>

                <Group position="right" spacing="xs">
                    <Button variant="outline" onClick={modalProps.onClose}>
                        {t(
                            'components_common_modal_chart_move_belongs_dashboard.cancel',
                        )}
                    </Button>

                    <Button
                        onClick={() => {
                            moveChartToSpace({
                                uuid,
                                spaceUuid,
                            });
                        }}
                        type="submit"
                    >
                        {t(
                            'components_common_modal_chart_move_belongs_dashboard.move',
                        )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};

export default MoveChartThatBelongsToDashboardModal;
