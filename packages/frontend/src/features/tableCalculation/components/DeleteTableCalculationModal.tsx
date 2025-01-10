import { type TableCalculation } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';

import useExplorerContext from '../../../providers/Explorer/useExplorerContext';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

type Props = Pick<ModalProps, 'onClose'> & {
    tableCalculation: TableCalculation;
};

export const DeleteTableCalculationModal: FC<Props> = ({
    tableCalculation,
    onClose,
}) => {
    const deleteTableCalculation = useExplorerContext(
        (context) => context.actions.deleteTableCalculation,
    );
    const { track } = useTracking();
    const { t } = useTranslation();

    const onConfirm = () => {
        deleteTableCalculation(tableCalculation.name);
        track({
            name: EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
        });
        onClose();
    };
    return (
        <Modal
            opened
            title={
                <Title order={4}>
                    {t('features_table_calculation_modal_delete.modal.title')}
                </Title>
            }
            onClose={onClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    {t('features_table_calculation_modal_delete.modal.content')}
                </Text>

                <Group position="right" mt="sm">
                    <Button variant="outline" color="dark" onClick={onClose}>
                        {t(
                            'features_table_calculation_modal_delete.modal.cancel',
                        )}
                    </Button>
                    <Button color="red" onClick={onConfirm}>
                        {t(
                            'features_table_calculation_modal_delete.modal.delete',
                        )}
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
