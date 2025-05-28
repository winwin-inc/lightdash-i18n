import { ChartSourceType, ContentType } from '@lightdash/common';
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
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { useContentAction } from '../../../hooks/useContent';
import MantineIcon from '../MantineIcon';

interface Props extends ModalProps {
    uuid: string;
    name: string;
    spaceUuid: string;
    spaceName: string;
    projectUuid: string | undefined;
    onConfirm: () => void;
}

const MoveChartThatBelongsToDashboardModal: FC<Props> = ({
    uuid,
    name,
    spaceUuid,
    spaceName,
    onConfirm,
    projectUuid,
    ...modalProps
}) => {
    const { t } = useTranslation();

    const { mutate: contentAction } = useContentAction(projectUuid, {
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
                            contentAction({
                                action: {
                                    type: 'move',
                                    targetSpaceUuid: spaceUuid,
                                },
                                item: {
                                    uuid,
                                    contentType: ContentType.CHART,
                                    source: ChartSourceType.DBT_EXPLORE,
                                },
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
